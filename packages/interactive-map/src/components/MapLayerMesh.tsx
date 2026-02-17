import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { LinearFilter, TextureLoader } from "three";

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
}

export function MapLayerMesh({ src, zIndex, position }: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);

  const processedTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;

    return texture;
  }, [texture]);

  const textureWidth = texture.image.width;
  const textureHeight = texture.image.height;

  return (
    <mesh position={[position?.x ?? 0, position?.y ?? 0, zIndex * 0.01]}>
      <planeGeometry args={[textureWidth, textureHeight]} />
      <meshBasicMaterial map={processedTexture} transparent />
    </mesh>
  );
}
