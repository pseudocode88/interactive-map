import type { MapLayer, PanConfig, ZoomConfig } from "../types";
import { CameraController } from "./CameraController";
import { MapLayerMesh } from "./MapLayerMesh";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;
}

export function MapScene({
  layers,
  baseWidth,
  baseHeight,
  panConfig,
  zoomConfig,
}: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
      />
      {sortedLayers.map((layer) => {
        const animation = layer.animation
          ? Array.isArray(layer.animation)
            ? layer.animation
            : [layer.animation]
          : undefined;

        return (
          <MapLayerMesh
            key={layer.id}
            src={layer.src}
            zIndex={layer.zIndex}
            position={layer.position}
            animation={animation}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
          />
        );
      })}
    </>
  );
}
