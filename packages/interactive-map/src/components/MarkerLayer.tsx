"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { ReactNode, RefObject } from "react";
import { useRef, useState } from "react";

import type { MapMarker } from "../types";
import { DefaultMarker } from "./DefaultMarker";

interface MarkerLayerProps {
  markers: MapMarker[];
  baseImageWidth: number;
  baseImageHeight: number;
  baseLayerZIndex: number;
  onMarkerClick: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => ReactNode;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

interface MarkerItemProps {
  marker: MapMarker;
  x: number;
  y: number;
  onMarkerClick: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => ReactNode;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

function MarkerItem({
  marker,
  x,
  y,
  onMarkerClick,
  renderMarker,
  viewportRef,
}: MarkerItemProps) {
  const markerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useFrame(() => {
    if (!markerRef.current) {
      return;
    }

    const zoom = Math.max(0.001, viewportRef.current?.zoom ?? 1);
    const hoverScale = isHovered ? 1.3 : 1;
    markerRef.current.style.transform = `scale(${hoverScale / zoom})`;
  });

  const markerColor = marker.color ?? "#ff4444";

  return (
    <Html
      center
      position={[x, y, 0]}
      prepend={false}
      style={{ pointerEvents: "auto" }}
      zIndexRange={[50, 0]}
    >
      <div
        ref={markerRef}
        onClick={(event) => {
          event.stopPropagation();
          onMarkerClick(marker.id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => setIsHovered(false)}
        style={{
          cursor: "pointer",
          position: "relative",
          transform: "scale(1)",
          transformOrigin: "center center",
          transition: "transform 150ms ease",
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
    </Html>
  );
}

export function MarkerLayer({
  markers,
  baseImageWidth,
  baseImageHeight,
  baseLayerZIndex,
  onMarkerClick,
  renderMarker,
  viewportRef,
}: MarkerLayerProps) {
  const markerLayerZ = baseLayerZIndex * 0.01 + 0.005;

  return (
    <group position={[0, 0, markerLayerZ]}>
      {markers.map((marker) => {
        const worldX = marker.x - baseImageWidth / 2;
        const worldY = baseImageHeight / 2 - marker.y;

        return (
          <MarkerItem
            key={marker.id}
            marker={marker}
            x={worldX}
            y={worldY}
            onMarkerClick={onMarkerClick}
            renderMarker={renderMarker}
            viewportRef={viewportRef}
          />
        );
      })}
    </group>
  );
}
