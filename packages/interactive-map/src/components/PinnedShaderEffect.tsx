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
import { useMaskTexture } from "../hooks/useMaskTexture";
import type { PinnedShaderEffectConfig } from "../types";
import {
  buildMaskUniforms,
  buildStandaloneShaderUniforms,
  DEFAULT_LAYER_VERTEX_SHADER,
  prependMaskDefine,
} from "../utils/shaderDefaults";
import { resolveShaderPreset } from "../utils/shaderPresets";

interface PinnedShaderEffectProps {
  config: PinnedShaderEffectConfig;
  /** Width of the parent layer's geometry (includes autoScale) */
  geoWidth: number;
  /** Height of the parent layer's geometry (includes autoScale) */
  geoHeight: number;
  /** Viewport ref for uViewport uniform */
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

interface PinnedShaderEffectInnerProps extends PinnedShaderEffectProps {
  texture: Texture | null;
}

function PinnedShaderEffectInner({
  config,
  geoWidth,
  geoHeight,
  viewportRef,
  texture,
}: PinnedShaderEffectInnerProps) {
  const meshRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
  const maskTexture = useMaskTexture(config.maskSrc);
  const maskChannel = config.maskChannel ?? "r";
  const hasMask = !!maskTexture;
  const localZOffset = config.localZOffset ?? 0.001;

  const resolvedPreset = useMemo(() => {
    if (!config.preset) {
      return null;
    }
    return resolveShaderPreset(config.preset, config.presetParams, !!texture, hasMask);
  }, [config.preset, config.presetParams, texture, hasMask]);

  const effectiveVertexShader =
    resolvedPreset?.vertexShader ?? config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER;
  const effectiveFragmentShader =
    resolvedPreset?.fragmentShader ??
    prependMaskDefine(config.fragmentShader ?? "", hasMask);

  const shaderUniforms = useMemo(() => {
    const autoUniforms = buildStandaloneShaderUniforms(geoWidth, geoHeight, texture);
    const presetUniforms = resolvedPreset?.uniforms ?? {};
    const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
    const customUniforms = config.uniforms ?? {};
    return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
  }, [config.uniforms, geoHeight, geoWidth, maskChannel, maskTexture, resolvedPreset, texture]);

  const hasShader = !!config.preset || !!config.fragmentShader;

  useFrame((_, delta) => {
    if (!shaderMaterialRef.current || !hasShader) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const uniforms = shaderMaterialRef.current.uniforms;
    uniforms.uTime.value = elapsed.current;
    uniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
    uniforms.uResolution.value = [geoWidth, geoHeight];
    if (uniforms.uTexture && texture) {
      uniforms.uTexture.value = texture;
    }
  });

  if (!hasShader) {
    return null;
  }

  return (
    <mesh ref={meshRef} position={[0, 0, localZOffset]}>
      <planeGeometry args={[geoWidth, geoHeight]} />
      <shaderMaterial
        ref={shaderMaterialRef}
        vertexShader={effectiveVertexShader}
        fragmentShader={effectiveFragmentShader}
        uniforms={shaderUniforms}
        transparent={config.transparent ?? true}
        depthWrite={false}
      />
    </mesh>
  );
}

function PinnedShaderEffectWithTexture(props: PinnedShaderEffectProps) {
  const rawTexture = useLoader(TextureLoader, props.config.src!);
  const texture = useMemo(() => {
    rawTexture.colorSpace = SRGBColorSpace;
    rawTexture.minFilter = LinearFilter;
    rawTexture.magFilter = LinearFilter;
    rawTexture.needsUpdate = true;
    return rawTexture;
  }, [rawTexture]);

  return <PinnedShaderEffectInner {...props} texture={texture} />;
}

export function PinnedShaderEffect(props: PinnedShaderEffectProps) {
  if (props.config.src) {
    return <PinnedShaderEffectWithTexture {...props} />;
  }

  return <PinnedShaderEffectInner {...props} texture={null} />;
}
