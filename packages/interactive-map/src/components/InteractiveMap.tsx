"use client";

import { Canvas } from "@react-three/fiber";

import type { InteractiveMapProps } from "../types";

export function InteractiveMap({
  width = "100%",
  height = "100%",
  className,
}: InteractiveMapProps) {
  return (
    <div style={{ width, height }} className={className}>
      <Canvas>
        <mesh>
          <planeGeometry args={[2, 2]} />
          <meshBasicMaterial color="skyblue" />
        </mesh>
      </Canvas>
    </div>
  );
}
