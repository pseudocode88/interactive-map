import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  LinearFilter,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import type { ShaderEffectConfig } from "../types";
import {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildStandaloneShaderUniforms,
} from "../utils/shaderDefaults";
import { computeParallaxScale } from "../utils/parallax";

interface ShaderEffectProps {
  config: ShaderEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

interface ShaderEffectInnerProps extends ShaderEffectProps {
  texture: Texture | null;
}

function ShaderEffectInner({
  config,
  baseWidth,
  baseHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
  texture,
}: ShaderEffectInnerProps) {
  const meshRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);

  const quadWidth = config.region ? config.region.width : baseWidth;
  const quadHeight = config.region ? config.region.height : baseHeight;

  const basePosition = useMemo(() => {
    if (config.region) {
      return {
        x: config.region.x + config.region.width / 2 - baseWidth / 2,
        y: baseHeight / 2 - (config.region.y + config.region.height / 2),
      };
    }

    return { x: 0, y: 0 };
  }, [config.region, baseHeight, baseWidth]);

  const zIndex = config.zIndex ?? 12;

  const shaderUniforms = useMemo(
    () => buildStandaloneShaderUniforms(quadWidth, quadHeight, texture, config.uniforms),
    [quadWidth, quadHeight, texture, config.uniforms]
  );

  useFrame((_, delta) => {
    if (!meshRef.current) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };

    if (shaderMaterialRef.current) {
      const uniforms = shaderMaterialRef.current.uniforms;
      uniforms.uTime.value = elapsed.current;
      uniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
      uniforms.uResolution.value = [quadWidth, quadHeight];
      if (uniforms.uTexture && texture) {
        uniforms.uTexture.value = texture;
      }
    }

    const panOffsetX = viewport.x * (1 - parallaxFactor);
    const panOffsetY = viewport.y * (1 - parallaxFactor);

    let x = basePosition.x + panOffsetX;
    let y = basePosition.y + panOffsetY;

    if (parallaxMode === "drift" && parallaxFactor !== 1) {
      const driftStrength = 0.1;
      const zoomDrift = (viewport.zoom - 1) * (parallaxFactor - 1) * driftStrength;
      x += viewport.x * zoomDrift;
      y += viewport.y * zoomDrift;
    }

    meshRef.current.position.x = x;
    meshRef.current.position.y = y;

    if (parallaxMode === "depth" && parallaxFactor !== 1) {
      const baseZoom = Math.max(0.001, viewport.zoom);
      const zoomFactor = computeParallaxScale(parallaxFactor, parallaxMode);
      const layerZoom = Math.max(0.001, 1 + (baseZoom - 1) * zoomFactor);
      const depthScale = layerZoom / baseZoom;
      meshRef.current.scale.set(depthScale, depthScale, 1);
    } else {
      meshRef.current.scale.set(1, 1, 1);
    }
  });

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[quadWidth, quadHeight]} />
      <shaderMaterial
        ref={shaderMaterialRef}
        vertexShader={config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
        fragmentShader={config.fragmentShader}
        uniforms={shaderUniforms}
        transparent={config.transparent ?? true}
        depthWrite={config.depthWrite ?? false}
      />
    </mesh>
  );
}

function ShaderEffectWithTexture(props: ShaderEffectProps) {
  const rawTexture = useLoader(TextureLoader, props.config.src!);
  const texture = useMemo(() => {
    rawTexture.colorSpace = SRGBColorSpace;
    rawTexture.minFilter = LinearFilter;
    rawTexture.magFilter = LinearFilter;
    rawTexture.needsUpdate = true;
    return rawTexture;
  }, [rawTexture]);

  return <ShaderEffectInner {...props} texture={texture} />;
}

export function ShaderEffect(props: ShaderEffectProps) {
  if (props.config.src) {
    return <ShaderEffectWithTexture {...props} />;
  }

  return <ShaderEffectInner {...props} texture={null} />;
}
