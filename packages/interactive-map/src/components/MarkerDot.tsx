"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending } from "three";
import type { Group, Mesh, MeshBasicMaterial } from "three";

import type { MapMarker } from "../types";

interface MarkerDotProps {
  marker: MapMarker;
  worldX: number;
  worldY: number;
  zPosition: number;
  onClick: () => void;
}

const MARKER_RADIUS = 20;
const TOOLTIP_OFFSET = MARKER_RADIUS * 2;
const DOT_PULSE_DURATION_SECONDS = 1.5;
const DOT_PULSE_MIN_SCALE = 0.88;
const DOT_PULSE_MAX_SCALE = 1.2;
const HALO_BASE_SCALE = 1.45;
const HALO_BASE_OPACITY = 0.32;

export function MarkerDot({
  marker,
  worldX,
  worldY,
  zPosition,
  onClick,
}: MarkerDotProps) {
  const dotRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const pulseRef = useRef<Mesh>(null);
  const haloMaterialRef = useRef<MeshBasicMaterial>(null);
  const pulseMaterialRef = useRef<MeshBasicMaterial>(null);
  const tooltipGroupRef = useRef<Group>(null);
  const currentScale = useRef(1);
  const [isHovered, setIsHovered] = useState(false);
  const color = marker.color ?? "#000";

  const tooltipStyle = useMemo(
    () => ({
      position: "relative" as const,
      maxWidth: 200,
      padding: "4px 8px",
      borderRadius: 4,
      background: "rgba(0, 0, 0, 0.8)",
      color: "#fff",
      fontSize: 12,
      lineHeight: 1.2,
      whiteSpace: "nowrap" as const,
      overflow: "hidden",
      textOverflow: "ellipsis" as const,
      pointerEvents: "none" as const,
    }),
    []
  );

  useFrame((state) => {
    const dot = dotRef.current;
    const halo = haloRef.current;
    const pulse = pulseRef.current;
    const haloMaterial = haloMaterialRef.current;
    const pulseMaterial = pulseMaterialRef.current;
    if (!dot || !halo || !pulse || !haloMaterial || !pulseMaterial) {
      return;
    }

    const zoom = Math.max(0.001, Number(state.camera.userData.interactiveMapZoom ?? 1));
    const pulseProgress =
      (Math.sin((state.clock.getElapsedTime() / DOT_PULSE_DURATION_SECONDS) * Math.PI * 2) +
        1) /
      2;
    const dotPulseScale =
      DOT_PULSE_MIN_SCALE +
      (DOT_PULSE_MAX_SCALE - DOT_PULSE_MIN_SCALE) * pulseProgress;
    const hoverScale = isHovered ? 1.3 : 1;
    const targetScale = (hoverScale * dotPulseScale) / zoom;
    currentScale.current += (targetScale - currentScale.current) * 0.2;
    dot.scale.setScalar(currentScale.current);

    const haloScale = (HALO_BASE_SCALE * (isHovered ? 1.12 : 1)) / zoom;
    halo.scale.setScalar(haloScale);
    haloMaterial.opacity = isHovered ? HALO_BASE_OPACITY + 0.14 : HALO_BASE_OPACITY;

    const pulseElapsed = (state.clock.getElapsedTime() % 1.5) / 1.5;
    const pulseScale = (1.25 + pulseElapsed * 1.35) / zoom;
    const pulseOpacity = 0.9 * (1 - pulseElapsed);
    pulse.scale.setScalar(pulseScale);
    pulseMaterial.opacity = pulseOpacity;
    if (tooltipGroupRef.current) {
      tooltipGroupRef.current.position.y = TOOLTIP_OFFSET / zoom;
    }
  });

  useEffect(() => {
    return () => {
      document.body.style.cursor = "default";
    };
  }, []);

  return (
    <group position={[worldX, worldY, zPosition]}>
      <mesh
        ref={dotRef}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerEnter={(event) => {
          event.stopPropagation();
          setIsHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerLeave={(event) => {
          event.stopPropagation();
          setIsHovered(false);
          document.body.style.cursor = "default";
        }}
      >
        <circleGeometry args={[MARKER_RADIUS, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <mesh ref={haloRef} position={[0, 0, -0.0015]} raycast={() => null}>
        <circleGeometry args={[MARKER_RADIUS, 32]} />
        <meshBasicMaterial
          ref={haloMaterialRef}
          color="#ffffff"
          transparent
          opacity={HALO_BASE_OPACITY}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <mesh ref={pulseRef} position={[0, 0, -0.001]} raycast={() => null}>
        <circleGeometry args={[MARKER_RADIUS, 32]} />
        <meshBasicMaterial
          ref={pulseMaterialRef}
          color="#ffffff"
          transparent
          opacity={0.9}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {isHovered ? (
        <group ref={tooltipGroupRef} position={[0, TOOLTIP_OFFSET, 0]}>
          <Html center style={{ pointerEvents: "none" }}>
            <div style={tooltipStyle}>
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
          </Html>
        </group>
      ) : null}
    </group>
  );
}

export type { MarkerDotProps };
