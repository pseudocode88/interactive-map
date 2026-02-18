import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import { LinearFilter, Mesh, SRGBColorSpace, TextureLoader } from "three";
import type { CarouselAnimation, LayerAnimation } from "../types";
import { computeAnimations, normalizeDirection } from "../utils/animation";
import { resolveEasing } from "../utils/easing";
import {
  computeAutoScaleFactor,
  computeParallaxScale,
} from "../utils/parallax";

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
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);
  const meshRef = useRef<Mesh>(null);
  const cloneRef = useRef<Mesh>(null);
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
      const material = meshRef.current.material;
      if ("opacity" in material) {
        material.opacity = animationResult.opacity;
      }
    }

    if (hasCarousel && cloneRef.current) {
      cloneRef.current.position.x = meshRef.current.position.x + tileOffset.x;
      cloneRef.current.position.y = meshRef.current.position.y + tileOffset.y;
      cloneRef.current.position.z = meshRef.current.position.z;
      cloneRef.current.scale.copy(meshRef.current.scale);

      if (animationResult.opacity !== null) {
        const cloneMaterial = cloneRef.current.material;
        if ("opacity" in cloneMaterial) {
          cloneMaterial.opacity = animationResult.opacity;
        }
      }
    }
  });

  return (
    <>
      <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
        <planeGeometry args={[geoWidth, geoHeight]} />
        <meshBasicMaterial map={processedTexture} transparent />
      </mesh>
      {hasCarousel ? (
        <mesh ref={cloneRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
          <planeGeometry args={[geoWidth, geoHeight]} />
          <meshBasicMaterial map={processedTexture} transparent />
        </mesh>
      ) : null}
    </>
  );
}
