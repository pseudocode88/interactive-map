import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import { LinearFilter, TextureLoader } from "three";

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  baseWidth: number;
  baseHeight: number;
}

export function MapLayerMesh({
  src,
  zIndex,
  baseWidth,
  baseHeight,
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);

  const processedTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;

    return texture;
  }, [texture]);

  return (
    <mesh position={[0, 0, zIndex * 0.01]}>
      <planeGeometry args={[baseWidth, baseHeight]} />
      <meshBasicMaterial map={processedTexture} transparent />
    </mesh>
  );
}
