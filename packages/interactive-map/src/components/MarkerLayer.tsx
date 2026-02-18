"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Vector3 } from "three";

import type { MapMarker } from "../types";
import { DefaultMarker } from "./DefaultMarker";

interface MarkerLayerProps {
  markers: MapMarker[];
  baseImageWidth: number;
  baseImageHeight: number;
  baseLayerZIndex: number;
  onMarkerClick: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => ReactNode;
  overlayContainer: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

function toWorldPosition(
  marker: MapMarker,
  baseImageWidth: number,
  baseImageHeight: number,
  markerLayerZ: number
) {
  return {
    x: marker.x - baseImageWidth / 2,
    y: baseImageHeight / 2 - marker.y,
    z: markerLayerZ,
  };
}

export function MarkerLayer({
  markers,
  baseImageWidth,
  baseImageHeight,
  baseLayerZIndex,
  onMarkerClick,
  renderMarker,
  overlayContainer,
  viewportRef,
}: MarkerLayerProps) {
  const { camera, size } = useThree();
  const markerLayerZ = baseLayerZIndex * 0.01 + 0.005;
  const markerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hoverScaleRefs = useRef<Map<string, number>>(new Map());
  const projectVector = useRef(new Vector3());
  const [hoveredMarkers, setHoveredMarkers] = useState<Record<string, boolean>>({});

  const markersById = useMemo(() => {
    return new Map(markers.map((marker) => [marker.id, marker]));
  }, [markers]);

  useFrame(() => {
    const zoom = Math.max(0.001, viewportRef.current?.zoom ?? 1);

    markerRefs.current.forEach((element, markerId) => {
      const marker = markersById.get(markerId);
      if (!marker) {
        return;
      }

      const world = toWorldPosition(marker, baseImageWidth, baseImageHeight, markerLayerZ);
      projectVector.current.set(world.x, world.y, world.z).project(camera);

      const screenX = (projectVector.current.x * 0.5 + 0.5) * size.width;
      const screenY = (-projectVector.current.y * 0.5 + 0.5) * size.height;

      const currentHoverScale = hoverScaleRefs.current.get(markerId) ?? 1;
      const targetHoverScale = hoveredMarkers[markerId] ? 1.3 : 1;
      const nextHoverScale =
        currentHoverScale + (targetHoverScale - currentHoverScale) * 0.2;

      hoverScaleRefs.current.set(markerId, nextHoverScale);
      element.style.transform = `translate(${screenX}px, ${screenY}px) scale(${nextHoverScale / zoom})`;
    });
  });

  const setMarkerRef = (markerId: string, node: HTMLDivElement | null) => {
    if (node) {
      markerRefs.current.set(markerId, node);
      return;
    }

    markerRefs.current.delete(markerId);
    hoverScaleRefs.current.delete(markerId);
  };

  const overlayRoot = overlayContainer.current;
  if (!overlayRoot) {
    return null;
  }

  return createPortal(
    <>
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
    </>,
    overlayRoot
  );
}
