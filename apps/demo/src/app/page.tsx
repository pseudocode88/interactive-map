"use client";

import { useMemo, useState } from "react";
import { InteractiveMap, type MapMarker } from "@interactive-map/core";

const layers = [
  {
    id: "cloud-back",
    src: "/overlay-cloud-back.png",
    zIndex: -1,
    animation: [
      // {
      //   type: "wobble" as const,
      //   offset: { x: 0, y: 1 },
      //   duration: 10,
      // },
    ],
  },
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud-front",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: 0 },
    animation: [
      // {
      //   type: "wobble" as const,
      //   offset: { x: 0, y: 0 },
      //   duration: 10,
      // },
      { type: "fade" as const, minOpacity: 0.4, maxOpacity: 0.6, duration: 6 },
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
      { type: "fade" as const, minOpacity: 0.8, maxOpacity: 1, duration: 10 }
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
      { type: "fade" as const, minOpacity: 0.6, maxOpacity: 1, duration: 3 }
    ],
  }
];

const markers: MapMarker[] = [
  { id: "castle", x: 900, y: 1280, label: "Castle", color: "#FFC857" },
  { id: "village", x: 1900, y: 1040, label: "Village", color: "#FFC857" },
  { id: "harbor", x: 3000, y: 1260, label: "Harbor Gate", color: "#FFC857" },
  { id: "forest", x: 2250, y: 520, label: "Dark Forest", color: "#FFC857" },
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
        spriteEffects={[
          {
            id: "birds",
            src: "/bird.png",
            maxCount: 4,
            speed: 100,
            speedVariance: 0.3,
            direction: { x: 1, y: -0.1 },
            directionVariance: 20,
            oscillation: { amplitude: 12, frequency: 0.6 },
            fps: 8,
            zIndex: 8,
            scale: 1,
          },
        ]}
        fogEffects={[]}
        particleEffects={[
          {
            id: "sparkles",
            mode: "twinkle",
            maxCount: 40,
            color: "#FFD700",
            size: 7,
            sizeVariance: 0.5,
            twinkleDuration: 2,
            twinkleDurationVariance: 0.6,
            regionMode: "container",
            zIndex: 11,
            opacity: 0.9,
          },
          {
            id: "embers",
            mode: "drift",
            maxCount: 40,
            color: "#FFD700",
            size: 7,
            sizeVariance: 0.4,
            driftDirection: { x: 0.1, y: 1 },
            driftDirectionVariance: 20,
            driftSpeed: 25,
            driftSpeedVariance: 0.3,
            driftDistance: 120,
            regionMode: "container",
            // region: { x: 0, y: 0, width: 1000, height: 400 },
            zIndex: 11,
            opacity: 0.8,
          },
          {
            id: "masked-sparkles",
            mode: "twinkle",
            maxCount: 80,
            color: "#66ffff",
            size: 4,
            sizeVariance: 0.4,
            twinkleDuration: 2.5,
            maskSrc: "/maps/demo-mask.png",
            maskChannel: "g",
            maskBehavior: "both",
            maskThreshold: 0.1,
            zIndex: 11,
          },
          {
            id: "masked-embers",
            mode: "drift",
            maxCount: 40,
            color: "#ff6633",
            size: 3,
            driftDirection: { x: 0, y: 1 },
            driftSpeed: 25,
            driftDistance: 80,
            maskSrc: "/maps/demo-mask.png",
            maskChannel: "b",
            maskBehavior: "spawn",
            zIndex: 11,
          },
        ]}
        shaderEffects={[
          {
            id: "water-overlay",
            preset: "waterRipple",
            presetParams: { uSpeed: 1, uAmplitude: 0.1 },
            zIndex: 9,
            space: "viewport",
          },
          {
            id: "masked-water",
            preset: "waterRipple",
            presetParams: { uSpeed: 0.8, uAmplitude: 0.015 },
            maskSrc: "/maps/demo-mask.png",
            maskChannel: "r",
            zIndex: 1.5,
            space: "map",
          },
          {
            id: "masked-glow",
            preset: "glow",
            presetParams: { uIntensity: 0.6, uGlowColor: [0.2, 1.0, 0.3] },
            maskSrc: "/maps/demo-mask.png",
            maskChannel: "g",
            zIndex: 1.5,
            space: "map",
          },
          {
            id: "vignette",
            space: "viewport",
            fragmentShader: `
              uniform float uTime;
              uniform vec2 uResolution;
              varying vec2 vUv;

              void main() {
                vec2 center = vUv - 0.5;
                float dist = length(center);
                float pulse = 0.85 + 0.15 * sin(uTime * 0.5);
                float vignette = smoothstep(0.5 * pulse, 0.9, dist);
                gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.4);
              }
            `,
            zIndex: 10,
          },
        ]}
        onMarkerClick={(markerId) => {
          console.log("[demo] marker clicked:", markerId);
          setSelectedMarkerId(markerId);
        }}
        resetZoomTrigger={resetZoomTrigger}
        baseLayerId="base"
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 1.6, initialZoom: 1.1 }}
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
          flexWrap: "wrap",
        }}
      >
        <span>Selected Marker: {selectedLabel}</span>
        <span style={{ opacity: 0.85 }}>Hover marker to see tooltip</span>
        <span style={{ opacity: 0.85 }}>Click marker to focus</span>
        <button
          type="button"
          onClick={() => {
            setSelectedMarkerId(null);
            setResetZoomTrigger((value) => value + 1);
          }}
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
