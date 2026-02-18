"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import { NoToneMapping } from "three";

import type { InteractiveMapProps, PanConfig, ZoomConfig } from "../types";
import { useBaseImageSize } from "../hooks/useBaseImageSize";
import { useContainerSize } from "../hooks/useContainerSize";
import { MapScene } from "./MapScene";

export function InteractiveMap({
  layers,
  width = "100%",
  height = "100%",
  className,
  panConfig,
  zoomConfig,
}: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseLayer = useMemo(() => {
    if (layers.length === 0) {
      return null;
    }

    return [...layers].sort((a, b) => a.zIndex - b.zIndex)[0];
  }, [layers]);

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
            panConfig={resolvedPanConfig}
            zoomConfig={resolvedZoomConfig}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
