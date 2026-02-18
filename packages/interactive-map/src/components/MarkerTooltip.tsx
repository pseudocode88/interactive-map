"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";

import type { MapMarker } from "../types";

interface MarkerTooltipProps {
  marker: MapMarker | null;
  worldX: number;
  worldY: number;
  containerRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
}

export function MarkerTooltip({
  marker,
  worldX,
  worldY,
  containerRef,
  viewportRef,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
}: MarkerTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip) {
      return;
    }

    if (!marker) {
      tooltip.style.opacity = "0";
      return;
    }

    let frameId = 0;
    const updatePosition = () => {
      const container = containerRef.current;
      const node = tooltipRef.current;
      if (!container || !node) {
        frameId = requestAnimationFrame(updatePosition);
        return;
      }

      const viewport = viewportRef.current;
      const zoom = Math.max(0.001, viewport.zoom);
      const halfWidth = baseFrustumHalfWidth / zoom;
      const halfHeight = baseFrustumHalfHeight / zoom;

      const ndcX = (worldX - viewport.x) / halfWidth;
      const ndcY = (worldY - viewport.y) / halfHeight;

      const rect = container.getBoundingClientRect();
      const screenX = (ndcX * 0.5 + 0.5) * rect.width;
      const screenY = (-ndcY * 0.5 + 0.5) * rect.height;

      node.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%) translateY(-12px)`;
      node.style.opacity = "1";

      frameId = requestAnimationFrame(updatePosition);
    };

    frameId = requestAnimationFrame(updatePosition);
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [
    marker,
    worldX,
    worldY,
    containerRef,
    viewportRef,
    baseFrustumHalfWidth,
    baseFrustumHalfHeight,
  ]);

  const tooltipStyle = useMemo(
    () => ({
      position: "absolute" as const,
      top: 0,
      left: 0,
      pointerEvents: "none" as const,
      opacity: 0,
      transition: "opacity 150ms ease",
      willChange: "transform",
      zIndex: 10,
    }),
    []
  );

  if (!marker) {
    return <div ref={tooltipRef} style={tooltipStyle} />;
  }

  return (
    <div ref={tooltipRef} style={tooltipStyle}>
      <div
        style={{
          position: "relative",
          background: "rgba(0, 0, 0, 0.8)",
          color: "#fff",
          fontSize: 12,
          lineHeight: 1.2,
          padding: "4px 8px",
          borderRadius: 4,
          whiteSpace: "nowrap",
          maxWidth: 200,
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {marker.label}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "100%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid rgba(0, 0, 0, 0.8)",
          }}
        />
      </div>
    </div>
  );
}

export type { MarkerTooltipProps };
