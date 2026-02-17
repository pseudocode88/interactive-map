import type { MapLayer } from "../types";
import { MapLayerMesh } from "./MapLayerMesh";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
}

export function MapScene({ layers, baseWidth, baseHeight }: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      {sortedLayers.map((layer) => (
        <MapLayerMesh
          key={layer.id}
          src={layer.src}
          zIndex={layer.zIndex}
          baseWidth={baseWidth}
          baseHeight={baseHeight}
        />
      ))}
    </>
  );
}
