"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { NoToneMapping } from "three";

import type {
  InteractiveMapProps,
  PanConfig,
  ParallaxConfig,
  ZoomConfig,
} from "../types";
import { useBaseImageSize } from "../hooks/useBaseImageSize";
import { useContainerSize } from "../hooks/useContainerSize";
import { MapScene } from "./MapScene";

export function InteractiveMap({
  layers,
  baseLayerId,
  width = "100%",
  height = "100%",
  className,
  panConfig,
  zoomConfig,
  parallaxConfig,
  markers,
  onMarkerClick,
  renderMarker,
  resetZoomTrigger,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markerOverlayRef = useRef<HTMLDivElement>(null);
  const baseLayer = useMemo(() => {
    if (layers.length === 0) {
      return null;
    }

    if (baseLayerId) {
      const found = layers.find((layer) => layer.id === baseLayerId);
      if (found) {
        return found;
      }

      console.warn(
        `[InteractiveMap] baseLayerId "${baseLayerId}" not found in layers. Falling back to lowest zIndex.`
      );
    }

    return [...layers].sort((a, b) => a.zIndex - b.zIndex)[0];
  }, [layers, baseLayerId]);

  const baseSize = useBaseImageSize(baseLayer?.src ?? "");
  const containerSize = useContainerSize(containerRef);

  if (
    !baseLayer ||
    !baseSize ||
    !containerSize ||
    containerSize.width === 0 ||
    containerSize.height === 0
  ) {
    return (
      <div ref={containerRef} style={{ width, height }} className={className} />
    );
  }

  const resolvedPanConfig: Required<PanConfig> = {
    enabled: panConfig?.enabled ?? true,
    easingFactor: panConfig?.easingFactor ?? 0.15,
  };
  const resolvedMinZoom = zoomConfig?.minZoom ?? 1;
  const resolvedMaxZoom = Math.max(zoomConfig?.maxZoom ?? 3, resolvedMinZoom);
  const resolvedInitialZoom = Math.min(
    resolvedMaxZoom,
    Math.max(zoomConfig?.initialZoom ?? 1, resolvedMinZoom)
  );
  const resolvedZoomConfig: Required<ZoomConfig> = {
    enabled: zoomConfig?.enabled ?? true,
    minZoom: resolvedMinZoom,
    maxZoom: resolvedMaxZoom,
    initialZoom: resolvedInitialZoom,
    scrollSpeed: zoomConfig?.scrollSpeed ?? 0.001,
    easingFactor: zoomConfig?.easingFactor ?? 0.15,
  };
  const resolvedParallaxConfig: Required<ParallaxConfig> | undefined = parallaxConfig
    ? {
        intensity: parallaxConfig.intensity ?? 0.3,
        mode: parallaxConfig.mode ?? "depth",
      }
    : undefined;

  const containerAspect = containerSize.height / containerSize.width;
  const imageAspect = baseSize.height / baseSize.width;

  let halfWidth: number;
  let halfHeight: number;

  if (containerAspect > imageAspect) {
    halfHeight = baseSize.height / 2;
    halfWidth = halfHeight * (containerSize.width / containerSize.height);
  } else {
    halfWidth = baseSize.width / 2;
    halfHeight = halfWidth * (containerSize.height / containerSize.width);
  }

  return (
    <div
      ref={containerRef}
      style={{
        width,
        height,
        position: "relative",
        cursor: resolvedPanConfig.enabled ? "grab" : "default",
        touchAction: "none",
      }}
      className={className}
    >
      <Canvas
        orthographic
        camera={{
          left: -halfWidth,
          right: halfWidth,
          top: halfHeight,
          bottom: -halfHeight,
          near: 0.1,
          far: 100,
          position: [0, 0, 10],
        }}
        gl={{ antialias: true, toneMapping: NoToneMapping }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <MapScene
            layers={layers}
            baseWidth={baseSize.width}
            baseHeight={baseSize.height}
            baseFrustumHalfWidth={halfWidth}
            baseFrustumHalfHeight={halfHeight}
            baseLayerId={baseLayer.id}
            baseLayerZIndex={baseLayer.zIndex}
            panConfig={resolvedPanConfig}
            zoomConfig={resolvedZoomConfig}
            parallaxConfig={resolvedParallaxConfig}
            markers={markers}
            onMarkerClick={onMarkerClick}
            renderMarker={renderMarker}
            resetZoomTrigger={resetZoomTrigger}
            markerOverlayRef={markerOverlayRef}
          />
        </Suspense>
      </Canvas>
      <div
        ref={markerOverlayRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      />
    </div>
  );
}
