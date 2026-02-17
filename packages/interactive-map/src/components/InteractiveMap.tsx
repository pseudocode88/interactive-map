"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";

import type { InteractiveMapProps, PanConfig } from "../types";
import { useBaseImageSize } from "../hooks/useBaseImageSize";
import { MapScene } from "./MapScene";

export function InteractiveMap({
  layers,
  width = "100%",
  height = "100%",
  className,
  panConfig,
}: InteractiveMapProps) {
  const baseLayer = useMemo(() => {
    if (layers.length === 0) {
      return null;
    }

    return [...layers].sort((a, b) => a.zIndex - b.zIndex)[0];
  }, [layers]);

  const baseSize = useBaseImageSize(baseLayer?.src ?? "");

  if (!baseLayer || !baseSize) {
    return <div style={{ width, height }} className={className} />;
  }

  const resolvedPanConfig: Required<PanConfig> = {
    enabled: panConfig?.enabled ?? true,
    easingFactor: panConfig?.easingFactor ?? 0.15,
  };

  const halfWidth = baseSize.width / 2;
  const halfHeight = baseSize.height / 2;

  return (
    <div
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
        gl={{ antialias: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <MapScene
            layers={layers}
            baseWidth={baseSize.width}
            baseHeight={baseSize.height}
            panConfig={resolvedPanConfig}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
