import { useLoader } from "@react-three/fiber";
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

  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  return (
    <mesh position={[0, 0, zIndex * 0.01]}>
      <planeGeometry args={[baseWidth, baseHeight]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}
