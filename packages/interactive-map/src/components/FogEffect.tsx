import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  LinearFilter,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Material,
} from "three";
import type { FogEffectConfig } from "../types";
import { resolveEasing } from "../utils/easing";
import { computeFogDrift, computeFogOpacity, computeFogScale } from "../utils/fog";
import { computeParallaxScale } from "../utils/parallax";

interface FogEffectProps {
  config: FogEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

function hasOpacity(material: Material): material is Material & { opacity: number } {
  return "opacity" in material;
}

export function FogEffect({
  config,
  baseWidth: _baseWidth,
  baseHeight: _baseHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
}: FogEffectProps) {
  const texture = useLoader(TextureLoader, config.src);
  const meshRef = useRef<Mesh>(null);
  const elapsed = useRef(0);

  const image = texture.image as { width?: number; height?: number } | undefined;
  const textureWidth = image?.width ?? 1;
  const textureHeight = image?.height ?? 1;

  const processedTexture = useMemo(() => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);

  const direction = useMemo(() => {
    const dx = config.direction?.x ?? 1;
    const dy = config.direction?.y ?? 0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }, [config.direction?.x, config.direction?.y]);

  const speed = config.speed ?? 20;
  const baseOpacity = config.opacity ?? 0.5;
  const zIndex = config.zIndex ?? 9;
  const basePosition = useMemo(
    () => ({ x: config.position?.x ?? 0, y: config.position?.y ?? 0 }),
    [config.position?.x, config.position?.y]
  );

  const opacityEasing = useMemo(
    () => (config.opacityPulse ? resolveEasing(config.opacityPulse.easing) : undefined),
    [config.opacityPulse]
  );
  const scaleEasing = useMemo(
    () => (config.scaleBreathing ? resolveEasing(config.scaleBreathing.easing) : undefined),
    [config.scaleBreathing]
  );

  useFrame((_, delta) => {
    if (!meshRef.current) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const drift = computeFogDrift(
      elapsed.current,
      speed,
      direction.x,
      direction.y,
      textureWidth,
      textureHeight
    );

    processedTexture.offset.set(
      drift.offsetX / textureWidth,
      drift.offsetY / textureHeight
    );

    const material = meshRef.current.material;
    const resolvedMaterial = Array.isArray(material) ? material[0] : material;
    if (resolvedMaterial && hasOpacity(resolvedMaterial)) {
      if (config.opacityPulse && opacityEasing) {
        resolvedMaterial.opacity = computeFogOpacity(
          elapsed.current,
          {
            minOpacity: config.opacityPulse.minOpacity ?? 0.3,
            maxOpacity: config.opacityPulse.maxOpacity ?? 0.8,
            duration: config.opacityPulse.duration ?? 4,
          },
          opacityEasing
        );
      } else {
        resolvedMaterial.opacity = baseOpacity;
      }
    }

    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
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

    let scaleX = 1;
    let scaleY = 1;

    if (parallaxMode === "depth" && parallaxFactor !== 1) {
      const baseZoom = Math.max(0.001, viewport.zoom);
      const zoomFactor = computeParallaxScale(parallaxFactor, parallaxMode);
      const layerZoom = Math.max(0.001, 1 + (baseZoom - 1) * zoomFactor);
      const depthScale = layerZoom / baseZoom;
      scaleX *= depthScale;
      scaleY *= depthScale;
    }

    if (config.scaleBreathing && scaleEasing) {
      const breathScale = computeFogScale(
        elapsed.current,
        {
          amplitude: config.scaleBreathing.amplitude ?? 0.1,
          duration: config.scaleBreathing.duration ?? 6,
        },
        scaleEasing
      );
      scaleX *= breathScale;
      scaleY *= breathScale;
    }

    meshRef.current.scale.set(scaleX, scaleY, 1);
  });

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[textureWidth, textureHeight]} />
      <meshBasicMaterial map={processedTexture} transparent opacity={baseOpacity} />
    </mesh>
  );
}
