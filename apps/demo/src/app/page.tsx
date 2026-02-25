"use client";

import { useEffect, useMemo, useState } from "react";
import { InteractiveMap, type MapMarker } from "@interactive-map/core";
import { mapRegistry } from "../maps";

const MOBILE_MEDIA_QUERY = "(max-width: 900px), (pointer: coarse)";
const DEFAULT_MAP_ID = "olympus";
const DEMO_MOBILE_MARKER_SCALE = 0.7;
const DEMO_MOBILE_BREAKPOINT = 768;

function buildMarkerMap(items: MapMarker[]) {
  return new Map(items.map((marker) => [marker.id, marker]));
}

function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const updateMatch = () => setIsMobile(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, []);

  return isMobile;
}

export default function Home() {
  const isMobile = useIsMobileViewport();
  const activeMap = mapRegistry[DEFAULT_MAP_ID];
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [resetZoomTrigger, setResetZoomTrigger] = useState(0);
  const [effectsEnabled, setEffectsEnabled] = useState(false);

  useEffect(() => {
    if (!isMobile) {
      setEffectsEnabled(true);
      return;
    }

    setEffectsEnabled(false);
    const timeoutId = window.setTimeout(() => {
      setEffectsEnabled(true);
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isMobile]);

  const mapConfig = useMemo(
    () => activeMap.buildConfig({ isMobile, effectsEnabled }),
    [activeMap, effectsEnabled, isMobile]
  );
  const markerMap = useMemo(() => buildMarkerMap(mapConfig.markers), [mapConfig.markers]);

  const selectedLabel = selectedMarkerId
    ? markerMap.get(selectedMarkerId)?.label ?? selectedMarkerId
    : "None";

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7", position: "relative" }}>
      <InteractiveMap
        layers={mapConfig.layers}
        markers={mapConfig.markers}
        loadingMessages={mapConfig.loadingMessages}
        loadingStyle={mapConfig.loadingStyle}
        renderConfig={mapConfig.renderConfig}
        blockOnParticleInit={mapConfig.blockOnParticleInit}
        spriteEffects={mapConfig.spriteEffects}
        pinnedSprites={mapConfig.pinnedSprites}
        fogEffects={mapConfig.fogEffects}
        particleEffects={mapConfig.particleEffects}
        shaderEffects={mapConfig.shaderEffects}
        maskEffects={mapConfig.maskEffects}
        onMarkerClick={(markerId) => {
          setSelectedMarkerId(markerId);
        }}
        resetZoomTrigger={resetZoomTrigger}
        baseLayerId={mapConfig.baseLayerId}
        panConfig={mapConfig.panConfig}
        zoomConfig={mapConfig.zoomConfig}
        parallaxConfig={mapConfig.parallaxConfig}
        mobileMarkerScale={DEMO_MOBILE_MARKER_SCALE}
        mobileBreakpoint={DEMO_MOBILE_BREAKPOINT}
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
        <span>Map: {activeMap.label}</span>
        <span>Selected Marker: {selectedLabel}</span>
        <span style={{ opacity: 0.85 }}>
          Marker scale {"<="} {DEMO_MOBILE_BREAKPOINT}px: {DEMO_MOBILE_MARKER_SCALE}
        </span>
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
