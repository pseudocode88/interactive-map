import { useRef } from "react";
import type { MapLayer, PanConfig, ParallaxConfig, ZoomConfig } from "../types";
import { computeParallaxFactor } from "../utils/parallax";
import { CameraController } from "./CameraController";
import { MapLayerMesh } from "./MapLayerMesh";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
  baseLayerId: string;
  baseLayerZIndex: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;
  parallaxConfig?: Required<ParallaxConfig>;
}

export function MapScene({
  layers,
  baseWidth,
  baseHeight,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  baseLayerId,
  baseLayerZIndex,
  panConfig,
  zoomConfig,
  parallaxConfig,
}: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
  const viewportRef = useRef({ x: 0, y: 0, zoom: zoomConfig.initialZoom });

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
        onViewportChange={(viewport) => {
          viewportRef.current = viewport;
        }}
      />
      {sortedLayers.map((layer) => {
        const animation = layer.animation
          ? Array.isArray(layer.animation)
            ? layer.animation
            : [layer.animation]
          : undefined;
        const isBaseLayer = layer.id === baseLayerId;
        const parallaxFactor =
          !parallaxConfig || isBaseLayer
            ? 1
            : computeParallaxFactor(
                layer,
                baseLayerZIndex,
                parallaxConfig.intensity
              );

        return (
          <MapLayerMesh
            key={layer.id}
            src={layer.src}
            zIndex={layer.zIndex}
            position={layer.position}
            animation={animation}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            baseFrustumHalfWidth={baseFrustumHalfWidth}
            baseFrustumHalfHeight={baseFrustumHalfHeight}
            minZoom={zoomConfig.minZoom}
            maxZoom={zoomConfig.maxZoom}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
          />
        );
      })}
    </>
  );
}
