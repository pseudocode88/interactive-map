import { useFrame, useLoader } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  LinearFilter,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Texture,
  TextureLoader,
} from "three";
import type { PinnedSpriteConfig } from "../types";
import { detectGrid, getFrameUV } from "../utils/spriteSheet";

interface PinnedSpriteProps {
  config: PinnedSpriteConfig;
  baseWidth: number;
  baseHeight: number;
}

export function PinnedSprite({ config, baseWidth, baseHeight }: PinnedSpriteProps) {
  const texture = useLoader(TextureLoader, config.src);
  const spriteRef = useRef<Sprite | null>(null);
  const frameRef = useRef(0);
  const frameTimerRef = useRef(0);
  const worldX = config.x - baseWidth / 2;
  const worldY = baseHeight / 2 - config.y;

  const sheetMeta = useMemo(() => {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = image?.width ?? 1;
    const height = image?.height ?? 1;
    return detectGrid(width, height);
  }, [texture.image]);

  const instanceTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    const cloned = texture.clone();
    cloned.minFilter = LinearFilter;
    cloned.magFilter = LinearFilter;
    cloned.colorSpace = SRGBColorSpace;
    cloned.needsUpdate = true;
    return cloned;
  }, [texture]);

  useEffect(
    () => () => {
      instanceTexture.dispose();
    },
    [instanceTexture]
  );

  const fps = config.fps ?? 8;
  const scale = config.scale ?? 1;
  const opacity = config.opacity ?? 1;
  const zPosition = (config.zIndex ?? 10) * 0.01;

  useFrame((_, delta) => {
    const sprite = spriteRef.current;
    const material = sprite?.material as SpriteMaterial | undefined;
    const map = material?.map as Texture | null | undefined;
    if (!sprite || !material || !map) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    const frameDuration = 1 / Math.max(1, fps);
    frameTimerRef.current += cappedDelta;

    while (frameTimerRef.current >= frameDuration) {
      frameTimerRef.current -= frameDuration;
      frameRef.current = (frameRef.current + 1) % sheetMeta.frameCount;
    }

    const uv = getFrameUV(frameRef.current, sheetMeta.cols, sheetMeta.rows);
    map.repeat.set(uv.repeatX, uv.repeatY);
    map.offset.set(uv.offsetX, uv.offsetY);
    sprite.position.set(worldX, worldY, zPosition);
    sprite.scale.set(sheetMeta.frameWidth * scale, sheetMeta.frameHeight * scale, 1);
    material.opacity = opacity;
  });

  return (
    <sprite ref={spriteRef} position={[worldX, worldY, zPosition]}>
      <spriteMaterial map={instanceTexture} transparent opacity={opacity} />
    </sprite>
  );
}
