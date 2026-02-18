"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { AdditiveBlending } from "three";
import type { Mesh, MeshBasicMaterial } from "three";

import type { MapMarker } from "../types";

interface MarkerDotProps {
  marker: MapMarker;
  worldX: number;
  worldY: number;
  zPosition: number;
  onHoverChange: (markerId: string | null) => void;
  onClick: () => void;
}

const MARKER_RADIUS = 20;
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
  onHoverChange,
  onClick,
}: MarkerDotProps) {
  const dotRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);
  const pulseRef = useRef<Mesh>(null);
  const haloMaterialRef = useRef<MeshBasicMaterial>(null);
  const pulseMaterialRef = useRef<MeshBasicMaterial>(null);
  const currentScale = useRef(1);
  const isHoveredRef = useRef(false);
  const color = marker.color ?? "#000";

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
    const hoverScale = isHoveredRef.current ? 1.3 : 1;
    const targetScale = (hoverScale * dotPulseScale) / zoom;
    currentScale.current += (targetScale - currentScale.current) * 0.2;
    dot.scale.setScalar(currentScale.current);

    const haloScale = (HALO_BASE_SCALE * (isHoveredRef.current ? 1.12 : 1)) / zoom;
    halo.scale.setScalar(haloScale);
    haloMaterial.opacity = isHoveredRef.current
      ? HALO_BASE_OPACITY + 0.14
      : HALO_BASE_OPACITY;

    const pulseElapsed = (state.clock.getElapsedTime() % 1.5) / 1.5;
    const pulseScale = (1.25 + pulseElapsed * 1.35) / zoom;
    const pulseOpacity = 0.9 * (1 - pulseElapsed);
    pulse.scale.setScalar(pulseScale);
    pulseMaterial.opacity = pulseOpacity;
  });

  useEffect(() => {
    return () => {
      if (isHoveredRef.current) {
        onHoverChange(null);
      }
      document.body.style.cursor = "auto";
    };
  }, [onHoverChange]);

  return (
    <group position={[worldX, worldY, zPosition]}>
      <mesh
        ref={dotRef}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          isHoveredRef.current = true;
          onHoverChange(marker.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          isHoveredRef.current = false;
          onHoverChange(null);
          document.body.style.cursor = "auto";
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
    </group>
  );
}

export type { MarkerDotProps };
