import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
} from "three";
import type {
  CarouselAnimation,
  LayerAnimation,
  LayerShaderConfig,
  PinnedEffects,
} from "../types";
import { useMaskTexture } from "../hooks/useMaskTexture";
import { computeAnimations, normalizeDirection } from "../utils/animation";
import { resolveEasing } from "../utils/easing";
import {
  computeAutoScaleFactor,
  computeParallaxScale,
} from "../utils/parallax";
import { PinnedParticleEffect } from "./PinnedParticleEffect";
import { PinnedShaderEffect } from "./PinnedShaderEffect";
import {
  buildMaskUniforms,
  buildLayerShaderUniforms,
  DEFAULT_LAYER_VERTEX_SHADER,
  prependMaskDefine,
} from "../utils/shaderDefaults";
import { resolveShaderPreset } from "../utils/shaderPresets";

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  animation?: LayerAnimation[];
  baseWidth: number;
  baseHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
  minZoom: number;
  maxZoom: number;
  parallaxFactor?: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  shaderConfig?: LayerShaderConfig;
  /** Pinned effects to render as children of this layer's mesh */
  pinnedEffects?: PinnedEffects;
  onTextureLoaded?: () => void;
  onMaskOperationLoaded?: (operationId: string) => void;
  pinnedShaderMaskTextureOperationIds?: Record<string, string>;
  pinnedParticleMaskSamplerOperationIds?: Record<string, string>;
  layerMaskTextureOperationId?: string;
}

export function MapLayerMesh({
  src,
  zIndex,
  position,
  animation,
  baseWidth,
  baseHeight,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  minZoom,
  maxZoom,
  parallaxFactor = 1,
  parallaxMode = "depth",
  viewportRef,
  shaderConfig,
  pinnedEffects,
  onTextureLoaded,
  onMaskOperationLoaded,
  pinnedShaderMaskTextureOperationIds,
  pinnedParticleMaskSamplerOperationIds,
  layerMaskTextureOperationId,
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);
  const meshRef = useRef<Mesh>(null);
  const cloneRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const cloneShaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
  const maskTexture = useMaskTexture(
    shaderConfig?.maskSrc,
    layerMaskTextureOperationId && onMaskOperationLoaded
      ? () => onMaskOperationLoaded(layerMaskTextureOperationId)
      : undefined
  );
  const maskChannel = shaderConfig?.maskChannel ?? "r";
  const hasMask = !!maskTexture;
  const textureWidth = texture.image.width;
  const textureHeight = texture.image.height;
  const autoScale = useMemo(() => {
    if (parallaxFactor === 1) {
      return 1;
    }

    return computeAutoScaleFactor(
      parallaxFactor,
      maxZoom,
      minZoom,
      parallaxMode,
      baseWidth,
      baseHeight,
      textureWidth,
      textureHeight,
      baseFrustumHalfWidth,
      baseFrustumHalfHeight
    );
  }, [
    baseFrustumHalfHeight,
    baseFrustumHalfWidth,
    baseHeight,
    baseWidth,
    maxZoom,
    minZoom,
    parallaxFactor,
    parallaxMode,
    textureHeight,
    textureWidth,
  ]);
  const carouselDirection = useMemo(() => {
    const carouselAnimation = (animation ?? []).find(
      (item): item is CarouselAnimation => item.type === "carousel"
    );
    if (!carouselAnimation) {
      return null;
    }

    return normalizeDirection(carouselAnimation.direction ?? { x: 1, y: 0 });
  }, [animation]);
  const hasCarousel = carouselDirection !== null;

  const processedTexture = useMemo(() => {
    const safeAutoScale = Math.max(1, autoScale);
    const uvScale = hasCarousel ? 1 : 1 / safeAutoScale;
    const hasVerticalCarouselMotion =
      hasCarousel && Math.abs(carouselDirection?.y ?? 0) > 0;

    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = hasCarousel ? RepeatWrapping : ClampToEdgeWrapping;
    texture.wrapT =
      hasVerticalCarouselMotion ? RepeatWrapping : ClampToEdgeWrapping;
    texture.repeat.set(uvScale, uvScale);
    const centerOffset = hasCarousel ? 0 : (1 - uvScale) / 2;
    texture.offset.set(centerOffset, centerOffset);
    texture.needsUpdate = true;

    return texture;
  }, [autoScale, carouselDirection?.y, hasCarousel, texture]);

  const resolvedPreset = useMemo(() => {
    if (!shaderConfig?.preset) {
      return null;
    }

    return resolveShaderPreset(
      shaderConfig.preset,
      shaderConfig.presetParams,
      true,
      hasMask
    );
  }, [shaderConfig?.preset, shaderConfig?.presetParams, hasMask]);

  const effectiveVertexShader =
    resolvedPreset?.vertexShader ??
    shaderConfig?.vertexShader ??
    DEFAULT_LAYER_VERTEX_SHADER;

  const effectiveFragmentShader =
    resolvedPreset?.fragmentShader ??
    prependMaskDefine(shaderConfig?.fragmentShader ?? "", hasMask);

  const shaderUniforms = useMemo(() => {
    if (!shaderConfig) {
      return null;
    }
    if (!shaderConfig.preset && !shaderConfig.fragmentShader) {
      return null;
    }

    const autoUniforms = buildLayerShaderUniforms(
      processedTexture,
      textureWidth,
      textureHeight
    );
    const presetUniforms = resolvedPreset?.uniforms ?? {};
    const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
    const customUniforms = shaderConfig.uniforms ?? {};

    return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
  }, [
    maskChannel,
    maskTexture,
    processedTexture,
    shaderConfig,
    resolvedPreset,
    textureHeight,
    textureWidth,
  ]);

  const cloneShaderUniforms = useMemo(() => {
    if (!shaderConfig) {
      return null;
    }
    if (!shaderConfig.preset && !shaderConfig.fragmentShader) {
      return null;
    }

    const autoUniforms = buildLayerShaderUniforms(
      processedTexture,
      textureWidth,
      textureHeight
    );
    const presetUniforms = resolvedPreset?.uniforms ?? {};
    const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
    const customUniforms = shaderConfig.uniforms ?? {};

    return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
  }, [
    maskChannel,
    maskTexture,
    processedTexture,
    shaderConfig,
    resolvedPreset,
    textureHeight,
    textureWidth,
  ]);

  const resolvedEasings = useMemo(
    () =>
      (animation ?? []).map((item) =>
        "easing" in item ? resolveEasing(item.easing) : undefined
      ),
    [animation]
  );

  const safeAutoScale = Math.max(1, autoScale);
  const geoWidth = textureWidth * safeAutoScale;
  const geoHeight = textureHeight * safeAutoScale;
  const tileOffset = useMemo(
    () => ({
      x: (carouselDirection?.x ?? 0) * geoWidth,
      y: (carouselDirection?.y ?? 0) * geoHeight,
    }),
    [carouselDirection, geoHeight, geoWidth]
  );
  const basePosition = {
    x: position?.x ?? 0,
    y: position?.y ?? 0,
  };
  const onTextureLoadedRef = useRef(onTextureLoaded);

  useEffect(() => {
    onTextureLoadedRef.current = onTextureLoaded;
  }, [onTextureLoaded]);

  useEffect(() => {
    onTextureLoadedRef.current?.();
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const animationResult =
      animation && animation.length > 0
        ? computeAnimations(
            animation,
            elapsed.current,
            baseWidth,
            baseHeight,
            geoWidth,
            geoHeight,
            resolvedEasings
          )
        : { offsetX: 0, offsetY: 0, opacity: null };

    const viewport = viewportRef?.current ?? { x: 0, y: 0, zoom: 1 };
    const panOffsetX = viewport.x * (1 - parallaxFactor);
    const panOffsetY = viewport.y * (1 - parallaxFactor);

    let x = basePosition.x + animationResult.offsetX + panOffsetX;
    let y = basePosition.y + animationResult.offsetY + panOffsetY;

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
      const scale = layerZoom / baseZoom;
      meshRef.current.scale.set(scale, scale, 1);
    } else {
      meshRef.current.scale.set(1, 1, 1);
    }

    if (animationResult.opacity !== null) {
      if (shaderMaterialRef.current) {
        if (shaderMaterialRef.current.uniforms.uOpacity) {
          shaderMaterialRef.current.uniforms.uOpacity.value = animationResult.opacity;
        }
        shaderMaterialRef.current.opacity = animationResult.opacity;
      } else {
        const material = meshRef.current.material;
        if ("opacity" in material) {
          material.opacity = animationResult.opacity;
        }
      }
    }

    if (hasCarousel && cloneRef.current) {
      cloneRef.current.position.x = meshRef.current.position.x + tileOffset.x;
      cloneRef.current.position.y = meshRef.current.position.y + tileOffset.y;
      cloneRef.current.position.z = meshRef.current.position.z;
      cloneRef.current.scale.copy(meshRef.current.scale);

      if (animationResult.opacity !== null) {
        if (cloneShaderMaterialRef.current) {
          if (cloneShaderMaterialRef.current.uniforms.uOpacity) {
            cloneShaderMaterialRef.current.uniforms.uOpacity.value = animationResult.opacity;
          }
          cloneShaderMaterialRef.current.opacity = animationResult.opacity;
        } else {
          const cloneMaterial = cloneRef.current.material;
          if ("opacity" in cloneMaterial) {
            cloneMaterial.opacity = animationResult.opacity;
          }
        }
      }
    }

    if (shaderMaterialRef.current) {
      const materialUniforms = shaderMaterialRef.current.uniforms;
      materialUniforms.uTime.value = elapsed.current;
      materialUniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
      materialUniforms.uResolution.value = [textureWidth, textureHeight];
      materialUniforms.uTexture.value = processedTexture;
    }

    if (cloneShaderMaterialRef.current) {
      const materialUniforms = cloneShaderMaterialRef.current.uniforms;
      materialUniforms.uTime.value = elapsed.current;
      materialUniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
      materialUniforms.uResolution.value = [textureWidth, textureHeight];
      materialUniforms.uTexture.value = processedTexture;
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
        <planeGeometry args={[geoWidth, geoHeight]} />
        {shaderConfig && shaderUniforms ? (
          <shaderMaterial
            ref={shaderMaterialRef}
            vertexShader={effectiveVertexShader}
            fragmentShader={effectiveFragmentShader}
            uniforms={shaderUniforms}
            transparent={shaderConfig.transparent ?? true}
            depthWrite={shaderConfig.depthWrite ?? false}
          />
        ) : (
          <meshBasicMaterial map={processedTexture} transparent />
        )}
        {pinnedEffects?.shaderEffects.map((effect) => (
          <PinnedShaderEffect
            key={effect.id}
            config={effect}
            geoWidth={geoWidth}
            geoHeight={geoHeight}
            viewportRef={viewportRef}
            maskTextureOperationId={pinnedShaderMaskTextureOperationIds?.[effect.id]}
            onMaskTextureLoaded={onMaskOperationLoaded}
          />
        ))}
        {pinnedEffects?.particleEffects.map((effect) => (
          <PinnedParticleEffect
            key={effect.id}
            config={effect}
            geoWidth={geoWidth}
            geoHeight={geoHeight}
            maskSamplerOperationId={pinnedParticleMaskSamplerOperationIds?.[effect.id]}
            onMaskSamplerLoaded={onMaskOperationLoaded}
          />
        ))}
      </mesh>
      {hasCarousel ? (
        <mesh ref={cloneRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
          <planeGeometry args={[geoWidth, geoHeight]} />
          {shaderConfig && cloneShaderUniforms ? (
            <shaderMaterial
              ref={cloneShaderMaterialRef}
              vertexShader={effectiveVertexShader}
              fragmentShader={effectiveFragmentShader}
              uniforms={cloneShaderUniforms}
              transparent={shaderConfig.transparent ?? true}
              depthWrite={shaderConfig.depthWrite ?? false}
            />
          ) : (
            <meshBasicMaterial map={processedTexture} transparent />
          )}
          {pinnedEffects?.shaderEffects.map((effect) => (
            <PinnedShaderEffect
              key={`${effect.id}-clone`}
              config={effect}
              geoWidth={geoWidth}
              geoHeight={geoHeight}
              viewportRef={viewportRef}
              maskTextureOperationId={pinnedShaderMaskTextureOperationIds?.[effect.id]}
              onMaskTextureLoaded={onMaskOperationLoaded}
            />
          ))}
          {/* Pinned effects on the clone have independent particle state (different random positions).
              This is acceptable because both meshes are rarely visible simultaneously during carousel wrap. */}
          {pinnedEffects?.particleEffects.map((effect) => (
            <PinnedParticleEffect
              key={`${effect.id}-clone`}
              config={effect}
              geoWidth={geoWidth}
              geoHeight={geoHeight}
              maskSamplerOperationId={pinnedParticleMaskSamplerOperationIds?.[effect.id]}
              onMaskSamplerLoaded={onMaskOperationLoaded}
            />
          ))}
        </mesh>
      ) : null}
    </>
  );
}
