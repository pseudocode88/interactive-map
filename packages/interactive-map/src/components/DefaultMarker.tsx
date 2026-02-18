"use client";

import { useEffect, useState } from "react";

interface DefaultMarkerProps {
  color: string;
  label: string;
  isHovered: boolean;
}

const MARKER_STYLE_ID = "interactive-map-marker-styles";

function ensureMarkerStyles() {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(MARKER_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = MARKER_STYLE_ID;
  style.textContent = `
    @keyframes interactive-map-marker-pulse {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
      100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

export function DefaultMarker({ color, label, isHovered }: DefaultMarkerProps) {
  const [localHovered, setLocalHovered] = useState(false);
  const hovered = isHovered || localHovered;

  useEffect(() => {
    ensureMarkerStyles();
  }, []);

  return (
    <div
      aria-label={label}
      onPointerEnter={() => setLocalHovered(true)}
      onPointerLeave={() => setLocalHovered(false)}
      style={{
        position: "relative",
        width: 14,
        height: 14,
        pointerEvents: "auto",
        transform: `scale(${hovered ? 1.3 : 1})`,
        transition: "transform 150ms ease",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          backgroundColor: color,
          boxShadow: `0 0 ${hovered ? 14 : 10}px ${color}`,
          transition: "box-shadow 150ms ease",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: color,
          transform: "translate(-50%, -50%)",
          opacity: 0.5,
          animation: "interactive-map-marker-pulse 1.5s ease-out infinite",
        }}
      />
    </div>
  );
}

export type { DefaultMarkerProps };
