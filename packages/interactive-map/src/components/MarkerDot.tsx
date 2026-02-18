"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";

import type { MapMarker } from "../types";

interface MarkerDotProps {
  marker: MapMarker;
  worldX: number;
  worldY: number;
  zPosition: number;
  onClick: () => void;
}

export function MarkerDot({
  marker,
  worldX,
  worldY,
  zPosition,
  onClick,
}: MarkerDotProps) {
  const dotRef = useRef<Mesh>(null);
  const pulseRef = useRef<Mesh>(null);
  const pulseMaterialRef = useRef<MeshBasicMaterial>(null);
  const tooltipGroupRef = useRef<Group>(null);
  const currentScale = useRef(1);
  const [isHovered, setIsHovered] = useState(false);
  const color = marker.color ?? "#ff4444";

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
    const pulse = pulseRef.current;
    const pulseMaterial = pulseMaterialRef.current;
    if (!dot || !pulse || !pulseMaterial) {
      return;
    }

    const zoom = Math.max(0.001, Number(state.camera.userData.interactiveMapZoom ?? 1));
    const targetScale = (isHovered ? 1.3 : 1) / zoom;
    currentScale.current += (targetScale - currentScale.current) * 0.2;
    dot.scale.setScalar(currentScale.current);

    const pulseElapsed = (state.clock.getElapsedTime() % 1.5) / 1.5;
    const pulseScale = (1 + pulseElapsed) / zoom;
    const pulseOpacity = 0.5 * (1 - pulseElapsed);
    pulse.scale.setScalar(pulseScale);
    pulseMaterial.opacity = pulseOpacity;
    if (tooltipGroupRef.current) {
      tooltipGroupRef.current.position.y = 14 / zoom;
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
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <mesh ref={pulseRef} raycast={() => null}>
        <circleGeometry args={[7, 32]} />
        <meshBasicMaterial ref={pulseMaterialRef} color={color} transparent opacity={0.5} />
      </mesh>

      {isHovered ? (
        <group ref={tooltipGroupRef} position={[0, 14, 0]}>
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
