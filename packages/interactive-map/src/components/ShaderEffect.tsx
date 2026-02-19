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
import { resolveShaderPreset } from "../utils/shaderPresets";

interface ShaderEffectProps {
  config: ShaderEffectConfig;
  baseWidth: number;
  baseHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
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
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
  texture,
}: ShaderEffectInnerProps) {
  const meshRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);

  const isViewportSpace = config.space === "viewport";
  const viewportWidthAtZoomOne = baseFrustumHalfWidth * 2;
  const viewportHeightAtZoomOne = baseFrustumHalfHeight * 2;

  const quadWidth = isViewportSpace
    ? (config.region?.width ?? viewportWidthAtZoomOne)
    : (config.region?.width ?? baseWidth);
  const quadHeight = isViewportSpace
    ? (config.region?.height ?? viewportHeightAtZoomOne)
    : (config.region?.height ?? baseHeight);

  const basePosition = useMemo(() => {
    if (config.region) {
      if (isViewportSpace) {
        return {
          x: config.region.x + config.region.width / 2 - viewportWidthAtZoomOne / 2,
          y:
            viewportHeightAtZoomOne / 2 - (config.region.y + config.region.height / 2),
        };
      }

      return {
        x: config.region.x + config.region.width / 2 - baseWidth / 2,
        y: baseHeight / 2 - (config.region.y + config.region.height / 2),
      };
    }

    return { x: 0, y: 0 };
  }, [
    baseHeight,
    baseWidth,
    config.region,
    isViewportSpace,
    viewportHeightAtZoomOne,
    viewportWidthAtZoomOne,
  ]);

  const zIndex = config.zIndex ?? 12;

  const resolvedPreset = useMemo(() => {
    if (!config.preset) {
      return null;
    }

    return resolveShaderPreset(config.preset, config.presetParams, !!texture);
  }, [config.preset, config.presetParams, texture]);

  const effectiveVertexShader =
    resolvedPreset?.vertexShader ?? config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER;

  const effectiveFragmentShader =
    resolvedPreset?.fragmentShader ?? config.fragmentShader ?? "";

  const shaderUniforms = useMemo(() => {
    const autoUniforms = buildStandaloneShaderUniforms(quadWidth, quadHeight, texture);
    const presetUniforms = resolvedPreset?.uniforms ?? {};
    const customUniforms = config.uniforms ?? {};

    return { ...autoUniforms, ...presetUniforms, ...customUniforms };
  }, [quadWidth, quadHeight, texture, resolvedPreset, config.uniforms]);
  const hasShader = !!config.preset || !!config.fragmentShader;

  useFrame((_, delta) => {
    if (!meshRef.current || !hasShader) {
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

    if (isViewportSpace) {
      const safeZoom = Math.max(0.001, viewport.zoom);
      meshRef.current.position.x = viewport.x + basePosition.x / safeZoom;
      meshRef.current.position.y = viewport.y + basePosition.y / safeZoom;
      meshRef.current.scale.set(1 / safeZoom, 1 / safeZoom, 1);
      return;
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

  if (!hasShader) {
    return null;
  }

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[quadWidth, quadHeight]} />
      <shaderMaterial
        ref={shaderMaterialRef}
        vertexShader={effectiveVertexShader}
        fragmentShader={effectiveFragmentShader}
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
