import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshBasicMaterial } from "three";
import type { LayerAnimation } from "../types";
import { computeAnimations } from "../utils/animation";
import { resolveEasing } from "../utils/easing";

interface UseLayerAnimationOptions {
  animations: LayerAnimation[];
  basePosition: { x: number; y: number };
  baseWidth: number;
  baseHeight: number;
  layerWidth: number;
  layerHeight: number;
}

export function useLayerAnimation(
  meshRef: RefObject<Mesh | null>,
  options: UseLayerAnimationOptions
) {
  const elapsed = useRef(0);
  const resolvedEasings = useMemo(
    () =>
      options.animations.map((animation) =>
        "easing" in animation ? resolveEasing(animation.easing) : undefined
      ),
    [options.animations]
  );

  useFrame((_, delta) => {
    if (!meshRef.current || options.animations.length === 0) {
      return;
    }

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const result = computeAnimations(
      options.animations,
      elapsed.current,
      options.baseWidth,
      options.baseHeight,
      options.layerWidth,
      options.layerHeight,
      resolvedEasings
    );

    meshRef.current.position.x = options.basePosition.x + result.offsetX;
    meshRef.current.position.y = options.basePosition.y + result.offsetY;

    if (result.opacity !== null) {
      const material = meshRef.current.material as MeshBasicMaterial;
      material.opacity = result.opacity;
    }
  });
}
