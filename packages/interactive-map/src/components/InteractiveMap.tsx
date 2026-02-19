"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NoToneMapping } from "three";

import type {
  InteractiveMapProps,
  PanConfig,
  ParallaxConfig,
  ZoomConfig,
} from "../types";
import {
  LoadingManagerContext,
  LoadingManagerProvider,
} from "../context/LoadingManagerContext";
import { useBaseImageSize } from "../hooks/useBaseImageSize";
import { useContainerSize } from "../hooks/useContainerSize";
import { LoadingManagerBridge } from "./LoadingManagerBridge";
import { LoadingOverlay } from "./LoadingOverlay";
import { MapScene } from "./MapScene";
import { MarkerTooltip } from "./MarkerTooltip";

function toWorldCoordinates(x: number, y: number, baseWidth: number, baseHeight: number) {
  return {
    x: x - baseWidth / 2,
    y: baseHeight / 2 - y,
  };
}

function InteractiveMapContent({
  layers,
  baseLayerId,
  width = "100%",
  height = "100%",
  className,
  panConfig,
  zoomConfig,
  parallaxConfig,
  markers,
  spriteEffects,
  fogEffects,
  particleEffects,
  shaderEffects,
  maskEffects,
  onMarkerClick,
  resetZoomTrigger,
  loadingMessages,
  loadingStyle,
  showLoadingScreen,
}: InteractiveMapProps) {
  const loadingManager = useContext(LoadingManagerContext);
  const shouldShowLoadingScreen = showLoadingScreen !== false;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: zoomConfig?.initialZoom ?? 1 });
  const [focusTarget, setFocusTarget] = useState<{ x: number; y: number } | null>(null);
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [loadingFadeComplete, setLoadingFadeComplete] = useState(!shouldShowLoadingScreen);

  useEffect(() => {
    if (!shouldShowLoadingScreen) {
      setLoadingFadeComplete(true);
    }
  }, [shouldShowLoadingScreen]);

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
  const markersById = useMemo(
    () => new Map((markers ?? []).map((marker) => [marker.id, marker])),
    [markers]
  );
  const hoveredMarker = hoveredMarkerId ? markersById.get(hoveredMarkerId) ?? null : null;

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
    focusEasingFactor: panConfig?.focusEasingFactor ?? 0.05,
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
    animateIntroZoom: zoomConfig?.animateIntroZoom ?? false,
    scrollSpeed: zoomConfig?.scrollSpeed ?? 0.001,
    easingFactor: zoomConfig?.easingFactor ?? 0.15,
    focusEasingFactor: zoomConfig?.focusEasingFactor ?? 0.05,
  };
  const introZoomActive = resolvedZoomConfig.animateIntroZoom && !loadingFadeComplete;
  const effectiveZoomConfig = introZoomActive
    ? { ...resolvedZoomConfig, initialZoom: resolvedMinZoom }
    : resolvedZoomConfig;
  const introZoomTrigger =
    resolvedZoomConfig.animateIntroZoom && loadingFadeComplete ? 1 : 0;
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

  const hoveredWorldCoordinates = hoveredMarker
    ? toWorldCoordinates(hoveredMarker.x, hoveredMarker.y, baseSize.width, baseSize.height)
    : { x: 0, y: 0 };

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
        <LoadingManagerBridge manager={loadingManager}>
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
              zoomConfig={effectiveZoomConfig}
              parallaxConfig={resolvedParallaxConfig}
              viewportRef={viewportRef}
              markers={markers}
              spriteEffects={spriteEffects}
              fogEffects={fogEffects}
              particleEffects={particleEffects}
              shaderEffects={shaderEffects}
              maskEffects={maskEffects}
              onMarkerClick={(markerId) => {
                const marker = markersById.get(markerId);
                if (!marker) {
                  return;
                }

                setFocusTarget(
                  toWorldCoordinates(marker.x, marker.y, baseSize.width, baseSize.height)
                );
                onMarkerClick?.(markerId);
              }}
              onMarkerHoverChange={(markerId) => {
                setHoveredMarkerId(markerId);
              }}
              focusTarget={focusTarget}
              onFocusComplete={() => setFocusTarget(null)}
              onFocusInterrupted={() => setFocusTarget(null)}
              resetZoomTrigger={resetZoomTrigger}
              introZoomTrigger={introZoomTrigger}
              onViewportChange={(viewport) => {
                viewportRef.current = viewport;
              }}
            />
          </Suspense>
        </LoadingManagerBridge>
      </Canvas>
      {shouldShowLoadingScreen && loadingManager ? (
        <LoadingOverlay
          messages={loadingMessages}
          loadingStyle={loadingStyle}
          onFadeComplete={() => setLoadingFadeComplete(true)}
        />
      ) : null}
      <MarkerTooltip
        marker={hoveredMarker}
        worldX={hoveredWorldCoordinates.x}
        worldY={hoveredWorldCoordinates.y}
        containerRef={containerRef}
        viewportRef={viewportRef}
        baseFrustumHalfWidth={halfWidth}
        baseFrustumHalfHeight={halfHeight}
      />
    </div>
  );
}

export function InteractiveMap(props: InteractiveMapProps) {
  if (props.showLoadingScreen === false) {
    return <InteractiveMapContent {...props} />;
  }

  return (
    <LoadingManagerProvider>
      <InteractiveMapContent {...props} />
    </LoadingManagerProvider>
  );
}
