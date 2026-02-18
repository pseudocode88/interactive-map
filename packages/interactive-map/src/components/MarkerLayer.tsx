"use client";

import type { ReactNode, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { MapMarker } from "../types";
import { DefaultMarker } from "./DefaultMarker";

interface MarkerLayerProps {
  markers: MapMarker[];
  baseImageWidth: number;
  baseImageHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
  onMarkerClick: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => ReactNode;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

function toWorldPosition(marker: MapMarker, baseImageWidth: number, baseImageHeight: number) {
  return {
    x: marker.x - baseImageWidth / 2,
    y: baseImageHeight / 2 - marker.y,
  };
}

export function MarkerLayer({
  markers,
  baseImageWidth,
  baseImageHeight,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  onMarkerClick,
  renderMarker,
  viewportRef,
}: MarkerLayerProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverScaleRefs = useRef<Map<string, number>>(new Map());
  const [hoveredMarkers, setHoveredMarkers] = useState<Record<string, boolean>>({});

  const markersById = useMemo(() => {
    return new Map(markers.map((marker) => [marker.id, marker]));
  }, [markers]);

  useEffect(() => {
    let frameId = 0;

    const updateTransforms = () => {
      const overlay = overlayRef.current;
      if (!overlay) {
        frameId = requestAnimationFrame(updateTransforms);
        return;
      }

      const width = overlay.clientWidth;
      const height = overlay.clientHeight;
      if (width === 0 || height === 0) {
        frameId = requestAnimationFrame(updateTransforms);
        return;
      }

      const viewport = viewportRef.current;
      const zoom = Math.max(0.001, viewport?.zoom ?? 1);
      const cameraX = viewport?.x ?? 0;
      const cameraY = viewport?.y ?? 0;
      const halfWidth = baseFrustumHalfWidth / zoom;
      const halfHeight = baseFrustumHalfHeight / zoom;

      markerRefs.current.forEach((element, markerId) => {
        const marker = markersById.get(markerId);
        if (!marker) {
          return;
        }

        const world = toWorldPosition(marker, baseImageWidth, baseImageHeight);
        const ndcX = (world.x - cameraX) / halfWidth;
        const ndcY = (world.y - cameraY) / halfHeight;

        const screenX = (ndcX * 0.5 + 0.5) * width;
        const screenY = (-ndcY * 0.5 + 0.5) * height;

        const currentHoverScale = hoverScaleRefs.current.get(markerId) ?? 1;
        const targetHoverScale = renderMarker && hoveredMarkers[markerId] ? 1.3 : 1;
        const nextHoverScale =
          currentHoverScale + (targetHoverScale - currentHoverScale) * 0.2;

        hoverScaleRefs.current.set(markerId, nextHoverScale);
        element.style.transform = `translate(${screenX}px, ${screenY}px) scale(${nextHoverScale / zoom})`;
      });

      frameId = requestAnimationFrame(updateTransforms);
    };

    frameId = requestAnimationFrame(updateTransforms);
    return () => cancelAnimationFrame(frameId);
  }, [
    baseFrustumHalfHeight,
    baseFrustumHalfWidth,
    baseImageHeight,
    baseImageWidth,
    hoveredMarkers,
    markersById,
    renderMarker,
    viewportRef,
  ]);

  const setMarkerRef = (markerId: string, node: HTMLDivElement | null) => {
    if (node) {
      markerRefs.current.set(markerId, node);
      return;
    }

    markerRefs.current.delete(markerId);
    hoverScaleRefs.current.delete(markerId);
  };

  return (
    <div
      ref={overlayRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {markers.map((marker) => {
        const markerColor = marker.color ?? "#ff4444";
        const isHovered = hoveredMarkers[marker.id] ?? false;

        return (
          <div
            key={marker.id}
            ref={(node) => setMarkerRef(marker.id, node)}
            onClick={(event) => {
              event.stopPropagation();
              onMarkerClick(marker.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={() => {
              setHoveredMarkers((previous) => ({ ...previous, [marker.id]: true }));
            }}
            onPointerLeave={() => {
              setHoveredMarkers((previous) => ({ ...previous, [marker.id]: false }));
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "auto",
              cursor: "pointer",
              willChange: "transform",
              transform: "translate(0px, 0px) scale(1)",
              transformOrigin: "center center",
            }}
          >
            {renderMarker ? (
              renderMarker(marker)
            ) : (
              <DefaultMarker color={markerColor} label={marker.label} isHovered={isHovered} />
            )}
            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: "100%",
                transform: "translateX(-50%) translateY(-8px)",
                maxWidth: 200,
                padding: "4px 8px",
                borderRadius: 4,
                background: "rgba(0, 0, 0, 0.8)",
                color: "#fff",
                fontSize: 12,
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                pointerEvents: "none",
                opacity: isHovered ? 1 : 0,
                transition: "opacity 150ms ease",
              }}
            >
              {marker.label}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "100%",
                  width: 0,
                  height: 0,
                  transform: "translateX(-50%)",
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "5px solid rgba(0, 0, 0, 0.8)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
