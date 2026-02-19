import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  LinearFilter,
  Mesh,
  SRGBColorSpace,
  ShaderMaterial,
  TextureLoader,
} from "three";
import type { CarouselAnimation, LayerAnimation, LayerShaderConfig } from "../types";
import { computeAnimations, normalizeDirection } from "../utils/animation";
import { resolveEasing } from "../utils/easing";
import {
  computeAutoScaleFactor,
  computeParallaxScale,
} from "../utils/parallax";
import {
  buildLayerShaderUniforms,
  DEFAULT_LAYER_VERTEX_SHADER,
} from "../utils/shaderDefaults";

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
  viewportRef?: RefObject<{ x: number; y: number; zoom: number }>;
  shaderConfig?: LayerShaderConfig;
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
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);
  const meshRef = useRef<Mesh>(null);
  const cloneRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const cloneShaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
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

  const processedTexture = useMemo(() => {
    const safeAutoScale = Math.max(1, autoScale);
    const uvScale = 1 / safeAutoScale;

    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.repeat.set(uvScale, uvScale);
    texture.offset.set((1 - uvScale) / 2, (1 - uvScale) / 2);
    texture.needsUpdate = true;

    return texture;
  }, [autoScale, texture]);

  const shaderUniforms = useMemo(() => {
    if (!shaderConfig) {
      return null;
    }

    return buildLayerShaderUniforms(
      processedTexture,
      textureWidth,
      textureHeight,
      shaderConfig.uniforms
    );
  }, [processedTexture, shaderConfig, textureHeight, textureWidth]);

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
            textureWidth,
            textureHeight,
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

    if (shaderMaterialRef.current && shaderUniforms) {
      shaderUniforms.uTime.value = elapsed.current;
      shaderUniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
      shaderUniforms.uResolution.value = [textureWidth, textureHeight];
      shaderUniforms.uTexture.value = processedTexture;

      const materialUniforms = shaderMaterialRef.current.uniforms;
      materialUniforms.uTime.value = shaderUniforms.uTime.value;
      materialUniforms.uViewport.value = shaderUniforms.uViewport.value;
      materialUniforms.uResolution.value = shaderUniforms.uResolution.value;
      materialUniforms.uTexture.value = shaderUniforms.uTexture.value;
    }

    if (cloneShaderMaterialRef.current && shaderUniforms) {
      const materialUniforms = cloneShaderMaterialRef.current.uniforms;
      materialUniforms.uTime.value = shaderUniforms.uTime.value;
      materialUniforms.uViewport.value = shaderUniforms.uViewport.value;
      materialUniforms.uResolution.value = shaderUniforms.uResolution.value;
      materialUniforms.uTexture.value = shaderUniforms.uTexture.value;
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
        <planeGeometry args={[geoWidth, geoHeight]} />
        {shaderConfig && shaderUniforms ? (
          <shaderMaterial
            ref={shaderMaterialRef}
            vertexShader={shaderConfig.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
            fragmentShader={shaderConfig.fragmentShader}
            uniforms={shaderUniforms}
            transparent={shaderConfig.transparent ?? true}
            depthWrite={shaderConfig.depthWrite ?? false}
          />
        ) : (
          <meshBasicMaterial map={processedTexture} transparent />
        )}
      </mesh>
      {hasCarousel ? (
        <mesh ref={cloneRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
          <planeGeometry args={[geoWidth, geoHeight]} />
          {shaderConfig && shaderUniforms ? (
            <shaderMaterial
              ref={cloneShaderMaterialRef}
              vertexShader={shaderConfig.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
              fragmentShader={shaderConfig.fragmentShader}
              uniforms={shaderUniforms}
              transparent={shaderConfig.transparent ?? true}
              depthWrite={shaderConfig.depthWrite ?? false}
            />
          ) : (
            <meshBasicMaterial map={processedTexture} transparent />
          )}
        </mesh>
      ) : null}
    </>
  );
}
