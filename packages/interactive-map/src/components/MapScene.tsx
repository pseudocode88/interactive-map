import type { MapLayer, PanConfig } from "../types";
import { CameraController } from "./CameraController";
import { MapLayerMesh } from "./MapLayerMesh";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
}

export function MapScene({
  layers,
  baseWidth,
  baseHeight,
  panConfig,
}: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
      />
      {sortedLayers.map((layer) => (
        <MapLayerMesh
          key={layer.id}
          src={layer.src}
          zIndex={layer.zIndex}
          position={layer.position}
        />
      ))}
    </>
  );
}
