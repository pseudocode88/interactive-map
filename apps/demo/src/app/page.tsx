"use client";

import { useMemo, useState } from "react";
import { InteractiveMap, type MapMarker } from "@interactive-map/core";

const layers = [
  {
    id: "cloud-back",
    src: "/overlay-cloud-back.png",
    zIndex: -1,
    animation: [
      {
        type: "wobble" as const,
        offset: { x: 0, y: 50 },
        duration: 10,
      },
    ],
  },
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud-front",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: -10 },
    animation: [
      {
        type: "bounce" as const,
        direction: { x: 0, y: 10 },
        amplitude: 15,
        duration: 2,
        easing: "ease-in-out" as const,
      },
      { type: "fade" as const, minOpacity: 0.4, maxOpacity: 1, duration: 3 },
    ],
  },
  {
    id: "cloud-slide-front",
    src: "/cloud-slide-front.png",
    zIndex: 4,
    animation: [
      {
        type: "carousel" as const,
        direction: { x: -1, y: 0 },
        speed: 40,
        easing: "ease-in-out" as const,
      },
    ],
  },
  {
    id: "cloud-slide-front-2",
    src: "/cloud-slide-front-2.png",
    zIndex: 5,
    animation: [
      {
        type: "carousel" as const,
        direction: { x: -1, y: 0 },
        speed: 10,
        easing: "ease-in-out" as const,
      },
    ],
  },
];

const markers: MapMarker[] = [
  { id: "city-west", x: 900, y: 1280, label: "West Watchtower", color: "#ff5a5a" },
  { id: "city-center", x: 1900, y: 1040, label: "Capital District", color: "#ffd166" },
  { id: "city-east", x: 3000, y: 1260, label: "Harbor Gate", color: "#4cc9f0" },
  { id: "peak-north", x: 2250, y: 520, label: "Northern Peaks", color: "#9ef01a" },
];

function buildMarkerMap(items: MapMarker[]) {
  return new Map(items.map((marker) => [marker.id, marker]));
}

export default function Home() {
  const markerMap = useMemo(() => buildMarkerMap(markers), []);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);

  const selectedLabel = selectedMarkerId
    ? markerMap.get(selectedMarkerId)?.label ?? selectedMarkerId
    : "None";

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7", position: "relative" }}>
      <InteractiveMap
        layers={layers}
        markers={markers}
        onMarkerClick={(markerId) => {
          console.log("[demo] marker clicked:", markerId);
          setSelectedMarkerId(markerId);
        }}
        resetZoomTrigger={resetZoomTrigger}
        baseLayerId="base"
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 1.6, initialZoom: 1 }}
        parallaxConfig={{ intensity: 0.3, mode: "depth" }}
      />

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 20,
          background: "rgba(0, 0, 0, 0.6)",
          color: "#ffffff",
          padding: "10px 12px",
          borderRadius: 8,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          fontSize: 13,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span>Selected Marker: {selectedLabel}</span>
        <button
          type="button"
          onClick={() => setResetZoomTrigger((value) => value + 1)}
          style={{
            border: "none",
            borderRadius: 6,
            padding: "6px 10px",
            background: "#ffffff",
            color: "#1f2937",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Reset Zoom
        </button>
      </div>
    </main>
  );
}
