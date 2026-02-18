import type { RefObject } from "react";
import { useCallback, useMemo } from "react";
import type {
  MapLayer,
  MapMarker,
  PanConfig,
  ParallaxConfig,
  ZoomConfig,
} from "../types";
import { computeParallaxFactor } from "../utils/parallax";
import { CameraController } from "./CameraController";
import { MapLayerMesh } from "./MapLayerMesh";
import { MarkerDot } from "./MarkerDot";

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
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  markers?: MapMarker[];
  onMarkerClick?: (markerId: string) => void;
  onMarkerHoverChange?: (markerId: string | null) => void;
  focusTarget?: { x: number; y: number } | null;
  onFocusComplete?: () => void;
  onFocusInterrupted?: () => void;
  resetZoomTrigger?: number;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
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
  viewportRef,
  markers,
  onMarkerClick,
  onMarkerHoverChange,
  focusTarget,
  onFocusComplete,
  onFocusInterrupted,
  resetZoomTrigger,
  onViewportChange,
}: MapSceneProps) {
  const stableHoverChange = useCallback(
    (markerId: string | null) => onMarkerHoverChange?.(markerId),
    [onMarkerHoverChange]
  );
  const sortedLayers = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers]);
  const markerZPosition = useMemo(() => {
    if (layers.length === 0) {
      return 0.01;
    }

    const maxLayerZIndex = Math.max(...layers.map((layer) => layer.zIndex));
    return maxLayerZIndex * 0.01 + 0.01;
  }, [layers]);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
        focusTarget={focusTarget}
        onFocusComplete={onFocusComplete}
        onFocusInterrupted={onFocusInterrupted}
        resetZoomTrigger={resetZoomTrigger}
        onViewportChange={(viewport) => onViewportChange?.(viewport)}
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
      {(markers ?? []).map((marker) => {
        const worldX = marker.x - baseWidth / 2;
        const worldY = baseHeight / 2 - marker.y;

        return (
          <MarkerDot
            key={marker.id}
            marker={marker}
            worldX={worldX}
            worldY={worldY}
            zPosition={markerZPosition}
            onHoverChange={stableHoverChange}
            onClick={() => onMarkerClick?.(marker.id)}
          />
        );
      })}
    </>
  );
}
