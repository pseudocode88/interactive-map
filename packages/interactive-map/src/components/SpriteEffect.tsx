import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  LinearFilter,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
} from "three";
import type { SpriteEffectConfig } from "../types";
import { computeParallaxScale } from "../utils/parallax";
import { getFrameUV, detectGrid } from "../utils/spriteSheet";
import {
  getOscillationOffset,
  initializeInstances,
  spawnInstance,
  updateInstance,
  type SpriteInstance,
} from "../utils/spriteInstances";

interface SpriteEffectProps {
  config: SpriteEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

export function SpriteEffect({
  config,
  baseWidth,
  baseHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
}: SpriteEffectProps) {
  const texture = useLoader(TextureLoader, config.src);
  const instancesRef = useRef<SpriteInstance[]>([]);
  const spriteRefs = useRef<(Sprite | null)[]>([]);
  const maxCount = config.maxCount ?? 5;
  const opacity = config.opacity ?? 1;
  const baseScale = config.scale ?? 1;

  const sheetMeta = useMemo(() => {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = image?.width ?? 1;
    const height = image?.height ?? 1;

    return detectGrid(width, height);
  }, [texture.image]);

  const instanceTextures = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return Array.from({ length: maxCount }, () => {
      const cloned = texture.clone();
      cloned.minFilter = LinearFilter;
      cloned.magFilter = LinearFilter;
      cloned.colorSpace = SRGBColorSpace;
      cloned.needsUpdate = true;
      return cloned;
    });
  }, [maxCount, texture]);

  useEffect(() => {
    instancesRef.current = initializeInstances(config, baseWidth, baseHeight, maxCount);
    spriteRefs.current.length = maxCount;
  }, [
    baseHeight,
    baseWidth,
    config.direction?.x,
    config.direction?.y,
    config.directionVariance,
    config.fps,
    config.oscillation?.amplitude,
    config.oscillation?.frequency,
    config.scale,
    config.speed,
    config.speedVariance,
    maxCount,
  ]);

  useEffect(
    () => () => {
      instanceTextures.forEach((item) => item.dispose());
    },
    [instanceTextures]
  );

  useFrame((_, delta) => {
    const cappedDelta = Math.min(delta, 0.1);
    const instances = instancesRef.current;
    if (instances.length === 0) {
      return;
    }

    while (instances.length < maxCount) {
      instances.push(spawnInstance(config, baseWidth, baseHeight));
    }

    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const panOffsetX = viewport.x * (1 - parallaxFactor);
    const panOffsetY = viewport.y * (1 - parallaxFactor);

    for (let index = 0; index < maxCount; index += 1) {
      const sprite = spriteRefs.current[index];
      const material = sprite?.material as SpriteMaterial | undefined;
      const map = material?.map as Texture | null | undefined;
      if (!sprite || !material || !map) {
        continue;
      }

      let instance = instances[index];
      if (!instance) {
        instance = spawnInstance(config, baseWidth, baseHeight);
        instances[index] = instance;
      }

      const alive = updateInstance(
        instance,
        cappedDelta,
        config,
        baseWidth,
        baseHeight,
        sheetMeta.frameCount
      );

      if (!alive) {
        instances[index] = spawnInstance(config, baseWidth, baseHeight);
        instance = instances[index];
      }

      const oscillationOffset = getOscillationOffset(instance, config);
      let x = instance.x + oscillationOffset.x + panOffsetX;
      let y = instance.y + oscillationOffset.y + panOffsetY;

      if (parallaxMode === "drift" && parallaxFactor !== 1) {
        const driftStrength = 0.1;
        const zoomDrift = (viewport.zoom - 1) * (parallaxFactor - 1) * driftStrength;
        x += viewport.x * zoomDrift;
        y += viewport.y * zoomDrift;
      }

      sprite.position.x = x;
      sprite.position.y = y;
      sprite.position.z = (config.zIndex ?? 10) * 0.01;

      const depthScale =
        parallaxMode === "depth" && parallaxFactor !== 1
          ? (() => {
              const baseZoom = Math.max(0.001, viewport.zoom);
              const zoomFactor = computeParallaxScale(parallaxFactor, parallaxMode);
              const layerZoom = Math.max(0.001, 1 + (baseZoom - 1) * zoomFactor);
              return layerZoom / baseZoom;
            })()
          : 1;
      const directionScaleX = instance.dx < 0 ? -1 : 1;

      sprite.scale.set(
        sheetMeta.frameWidth * baseScale * directionScaleX * depthScale,
        sheetMeta.frameHeight * baseScale * depthScale,
        1
      );

      const uv = getFrameUV(instance.frame, sheetMeta.cols, sheetMeta.rows);
      map.repeat.set(uv.repeatX, uv.repeatY);
      map.offset.set(uv.offsetX, uv.offsetY);
      material.opacity = opacity;
    }
  });

  return (
    <>
      {instanceTextures.map((map, index) => (
        <sprite
          key={`${config.id}-${index}`}
          ref={(value) => {
            spriteRefs.current[index] = value;
          }}
          position={[0, 0, (config.zIndex ?? 10) * 0.01]}
        >
          <spriteMaterial map={map} transparent opacity={opacity} />
        </sprite>
      ))}
    </>
  );
}
