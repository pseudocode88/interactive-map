import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import type {
  MapLayer,
  MapMarker,
  PanConfig,
  ParallaxConfig,
  ZoomConfig,
} from "../types";
import { computeParallaxFactor } from "../utils/parallax";
import { CameraController } from "./CameraController";
import { MarkerLayer } from "./MarkerLayer";
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
  markers?: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => ReactNode;
  resetZoomTrigger?: number;
}

function toWorldCoordinates(marker: MapMarker, baseWidth: number, baseHeight: number) {
  return {
    x: marker.x - baseWidth / 2,
    y: baseHeight / 2 - marker.y,
  };
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
  markers,
  onMarkerClick,
  renderMarker,
  resetZoomTrigger,
}: MapSceneProps) {
  const sortedLayers = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers]);
  const markersById = useMemo(() => {
    return new Map((markers ?? []).map((marker) => [marker.id, marker]));
  }, [markers]);

  const viewportRef = useRef({ x: 0, y: 0, zoom: zoomConfig.initialZoom });
  const [focusTarget, setFocusTarget] = useState<{ x: number; y: number } | null>(null);

  const handleMarkerClick = (markerId: string) => {
    const marker = markersById.get(markerId);
    if (!marker) {
      return;
    }

    setFocusTarget(toWorldCoordinates(marker, baseWidth, baseHeight));
    onMarkerClick?.(markerId);
  };

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
        focusTarget={focusTarget}
        onFocusComplete={() => setFocusTarget(null)}
        resetZoomTrigger={resetZoomTrigger}
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
      {markers && markers.length > 0 ? (
        <MarkerLayer
          markers={markers}
          baseImageWidth={baseWidth}
          baseImageHeight={baseHeight}
          baseLayerZIndex={baseLayerZIndex}
          onMarkerClick={handleMarkerClick}
          renderMarker={renderMarker}
          viewportRef={viewportRef}
        />
      ) : null}
    </>
  );
}
