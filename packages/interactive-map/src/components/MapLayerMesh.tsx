import { useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { LinearFilter, Mesh, SRGBColorSpace, TextureLoader } from "three";
import { useLayerAnimation } from "../hooks/useLayerAnimation";
import type { LayerAnimation } from "../types";

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
}

export function MapLayerMesh({
  src,
  zIndex,
  position,
  animation,
  baseWidth,
  baseHeight,
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);
  const meshRef = useRef<Mesh>(null);

  const processedTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
  }, [texture]);

  const textureWidth = texture.image.width;
  const textureHeight = texture.image.height;
  const basePosition = {
    x: position?.x ?? 0,
    y: position?.y ?? 0,
  };

  useLayerAnimation(meshRef, {
    animations: animation ?? [],
    basePosition,
    baseWidth,
    baseHeight,
    layerWidth: textureWidth,
    layerHeight: textureHeight,
  });

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[textureWidth, textureHeight]} />
      <meshBasicMaterial map={processedTexture} transparent />
    </mesh>
  );
}
