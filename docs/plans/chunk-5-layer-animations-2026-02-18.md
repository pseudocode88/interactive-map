---
Name: Chunk 5 - Layer Animations
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18 (Review Fixes)
---

# Brief
Implement a per-layer animation system for the interactive map. Layers can have one or more animations running in parallel (e.g., a cloud that bounces while fading in/out). Four animation types are supported: **bounce** (oscillate along a direction), **carousel** (continuous movement with optional seamless wrap), **fade** (opacity oscillation), and **wobble** (sway back and forth between two offset points). Each animation has its own easing function — either a named preset or a custom cubic-bezier curve. Animations are time-based, driven by `useFrame` delta accumulation, and automatically pause when the browser tab is hidden.

# Plan & Instruction

## Step 1: Add Animation Types

Update `packages/interactive-map/src/types/index.ts`.

### 1.1 Easing Type

```ts
export type EasingPreset = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/**
 * Either a named preset or a custom cubic-bezier tuple [x1, y1, x2, y2].
 * Default is 'ease-in-out' for all animation types.
 */
export type EasingConfig = EasingPreset | [number, number, number, number];
```

### 1.2 Animation Config Types

```ts
export interface BounceAnimation {
  type: 'bounce';
  /** Direction vector for bounce (normalized internally). Default: { x: 0, y: 1 } (vertical) */
  direction?: { x: number; y: number };
  /** Max displacement in pixels along the direction. Default: 20 */
  amplitude?: number;
  /** Duration of one full bounce cycle (up and back) in seconds. Default: 1 */
  duration?: number;
  /** Easing function for the bounce. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface CarouselAnimation {
  type: 'carousel';
  /** Direction vector for movement (normalized internally). Default: { x: 1, y: 0 } (rightward) */
  direction?: { x: number; y: number };
  /** Movement speed in pixels per second. Default: 50 */
  speed?: number;
  /**
   * 'wrap' — layer re-enters from the opposite side when it exits base image bounds (seamless loop).
   * 'infinite' — layer keeps moving in one direction forever (eventually leaves visible area).
   * Default: 'wrap'
   */
  mode?: 'wrap' | 'infinite';
  /** Easing is not applicable for carousel (constant velocity). This field is ignored if provided. */
}

export interface FadeAnimation {
  type: 'fade';
  /** Minimum opacity. Default: 0 */
  minOpacity?: number;
  /** Maximum opacity. Default: 1 */
  maxOpacity?: number;
  /** Duration of one full fade cycle (min → max → min) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the fade. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface WobbleAnimation {
  type: 'wobble';
  /** Offset from center position in pixels. Layer sways between -offset and +offset. Default: { x: 10, y: 0 } */
  offset?: { x: number; y: number };
  /** Duration of one full wobble cycle (left → right → left) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the wobble. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export type LayerAnimation = BounceAnimation | CarouselAnimation | FadeAnimation | WobbleAnimation;
```

### 1.3 Update MapLayer

Add the `animation` field to `MapLayer`:

```ts
export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  /** Single animation or array of parallel animations. */
  animation?: LayerAnimation | LayerAnimation[];
}
```

No changes to `InteractiveMapProps`, `PanConfig`, or `ZoomConfig`.

## Step 2: Create Easing Utilities

Create new file `packages/interactive-map/src/utils/easing.ts`.

This file provides the easing math. All functions take a normalized `t` (0–1) and return a transformed value (0–1).

### 2.1 Cubic Bezier Evaluator

Implement a cubic-bezier evaluator. The standard approach is to solve for `t` on the X curve using Newton's method, then evaluate Y at that `t`. This is the same algorithm CSS `cubic-bezier()` uses.

```ts
/**
 * Attempt to find t for a given x on a cubic bezier curve using Newton-Raphson.
 * Falls back to binary search if Newton's method doesn't converge.
 */
function solveCubicBezierX(x: number, x1: number, x2: number): number {
  // Coefficients for the cubic bezier x(t) = 3a(1-t)^2*t + 3b(1-t)*t^2 + t^3
  // Expanded: x(t) = (3*x1 - 3*x2 + 1)*t^3 + (3*x2 - 6*x1)*t^2 + 3*x1*t
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  // Newton-Raphson iteration
  let t = x; // initial guess
  for (let i = 0; i < 8; i++) {
    const currentX = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(currentX) < 1e-7) return t;
    const derivative = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(derivative) < 1e-7) break;
    t -= currentX / derivative;
  }

  // Binary search fallback
  let lo = 0;
  let hi = 1;
  t = x;
  while (lo < hi) {
    const mid = (lo + hi) / 2;
    const currentX = ((ax * mid + bx) * mid + cx) * mid;
    if (Math.abs(currentX - x) < 1e-7) return mid;
    if (currentX < x) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7) break;
  }
  return (lo + hi) / 2;
}

export function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  const solvedT = solveCubicBezierX(t, x1, x2);

  // Evaluate y at solvedT
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return ((ay * solvedT + by) * solvedT + cy) * solvedT;
}
```

### 2.2 Named Preset Mappings

```ts
const EASING_PRESETS: Record<string, [number, number, number, number]> = {
  'linear': [0, 0, 1, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};
```

### 2.3 Unified Easing Resolver

```ts
import type { EasingConfig } from '../types';

export function resolveEasing(config: EasingConfig | undefined): (t: number) => number {
  if (!config) {
    // Default: ease-in-out
    return (t) => cubicBezier(t, 0.42, 0, 0.58, 1);
  }

  if (typeof config === 'string') {
    const preset = EASING_PRESETS[config];
    // If preset is linear, return identity for performance
    if (config === 'linear') return (t) => t;
    return (t) => cubicBezier(t, preset[0], preset[1], preset[2], preset[3]);
  }

  // Custom cubic-bezier tuple
  const [x1, y1, x2, y2] = config;
  return (t) => cubicBezier(t, x1, y1, x2, y2);
}
```

Export `resolveEasing` as the public API of this module.

## Step 3: Create Animation Computation Utility

Create new file `packages/interactive-map/src/utils/animation.ts`.

This file contains pure functions that compute animation offsets given elapsed time and config. No React or Three.js dependencies — purely mathematical.

### 3.1 Normalize Direction Helper

```ts
function normalizeDirection(dir: { x: number; y: number }): { x: number; y: number } {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) return { x: 0, y: 1 }; // fallback to vertical
  return { x: dir.x / len, y: dir.y / len };
}
```

### 3.2 Ping-Pong Progress Helper

For bounce, fade, and wobble, we need a triangle wave: progress goes 0→1→0→1→0... over time.

```ts
/**
 * Given elapsed time and cycle duration, returns a ping-pong progress value (0→1→0).
 * One full cycle = duration seconds (0→1→0).
 */
function pingPongProgress(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  // Normalize to 0–1 within a full cycle
  const cycleProgress = (elapsed % duration) / duration;
  // Triangle wave: 0→1 in first half, 1→0 in second half
  return cycleProgress <= 0.5
    ? cycleProgress * 2
    : (1 - cycleProgress) * 2;
}
```

### 3.3 Animation Result Interface

```ts
export interface AnimationResult {
  /** Position offset in pixels from layer's base position */
  offsetX: number;
  offsetY: number;
  /** Opacity value (0–1). null means no opacity change (use default 1). */
  opacity: number | null;
}
```

### 3.4 Compute Bounce

```ts
import { resolveEasing } from './easing';
import type { BounceAnimation } from '../types';

export function computeBounce(
  animation: BounceAnimation,
  elapsed: number
): AnimationResult {
  const direction = normalizeDirection(animation.direction ?? { x: 0, y: 1 });
  const amplitude = animation.amplitude ?? 20;
  const duration = animation.duration ?? 1;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);

  return {
    offsetX: direction.x * amplitude * easedProgress,
    offsetY: direction.y * amplitude * easedProgress,
    opacity: null,
  };
}
```

### 3.5 Compute Carousel

Carousel is special — it doesn't use easing (constant velocity). It uses elapsed time × speed to compute displacement, then wraps if in `wrap` mode.

```ts
import type { CarouselAnimation } from '../types';

export function computeCarousel(
  animation: CarouselAnimation,
  elapsed: number,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number
): AnimationResult {
  const direction = normalizeDirection(animation.direction ?? { x: 1, y: 0 });
  const speed = animation.speed ?? 50;
  const mode = animation.mode ?? 'wrap';

  const displacement = elapsed * speed;
  let offsetX = direction.x * displacement;
  let offsetY = direction.y * displacement;

  if (mode === 'wrap') {
    // Wrap boundary: base image bounds + layer dimensions
    // The layer should wrap when its center exits one side and re-enter from the other.
    // Total wrap distance along the movement axis:
    //   For X: baseWidth + layerWidth (so the layer fully exits before re-entering)
    //   For Y: baseHeight + layerHeight
    //
    // We compute the wrap distance along the direction vector.
    const wrapDistX = baseWidth + layerWidth;
    const wrapDistY = baseHeight + layerHeight;

    // Project offset onto direction to get scalar displacement
    // Then wrap the scalar and re-project
    // Simpler approach: wrap each axis independently based on contribution
    if (direction.x !== 0) {
      const totalX = wrapDistX / Math.abs(direction.x);
      const wrappedDisplacement = ((displacement % totalX) + totalX) % totalX;
      // Shift so the layer starts at one edge: offset from -halfWrap to +halfWrap
      const halfWrapX = wrapDistX / 2;
      offsetX = direction.x * wrappedDisplacement;
      // Re-center: layer starts at -(baseWidth/2 + layerWidth/2) and wraps
      if (direction.x > 0) {
        offsetX = ((offsetX + halfWrapX) % wrapDistX) - halfWrapX;
      } else {
        offsetX = -((((-offsetX) + halfWrapX) % wrapDistX) - halfWrapX);
      }
    }

    if (direction.y !== 0) {
      const totalY = wrapDistY / Math.abs(direction.y);
      const wrappedDisplacement = ((displacement % totalY) + totalY) % totalY;
      const halfWrapY = wrapDistY / 2;
      offsetY = direction.y * wrappedDisplacement;
      if (direction.y > 0) {
        offsetY = ((offsetY + halfWrapY) % wrapDistY) - halfWrapY;
      } else {
        offsetY = -((((-offsetY) + halfWrapY) % wrapDistY) - halfWrapY);
      }
    }
  }

  return {
    offsetX,
    offsetY,
    opacity: null,
  };
}
```

**Key design note on carousel wrapping:**

The wrap distance is `baseImageDimension + layerDimension`. This ensures:
- The layer fully exits the base image bounds before wrapping
- It seamlessly re-enters from the opposite edge
- No sudden pop-in: the layer slides in from outside the visible area

The layer's base position (from `layer.position`) acts as the starting offset — the carousel displacement is added on top of it.

### 3.6 Compute Fade

```ts
import type { FadeAnimation } from '../types';

export function computeFade(
  animation: FadeAnimation,
  elapsed: number
): AnimationResult {
  const minOpacity = animation.minOpacity ?? 0;
  const maxOpacity = animation.maxOpacity ?? 1;
  const duration = animation.duration ?? 2;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);

  const opacity = minOpacity + (maxOpacity - minOpacity) * easedProgress;

  return {
    offsetX: 0,
    offsetY: 0,
    opacity,
  };
}
```

### 3.7 Compute Wobble

```ts
import type { WobbleAnimation } from '../types';

export function computeWobble(
  animation: WobbleAnimation,
  elapsed: number
): AnimationResult {
  const offsetConfig = animation.offset ?? { x: 10, y: 0 };
  const duration = animation.duration ?? 2;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);

  // Wobble goes from -offset to +offset.
  // Map eased progress (0→1) to (-1→+1): factor = easedProgress * 2 - 1
  const factor = easedProgress * 2 - 1;

  return {
    offsetX: offsetConfig.x * factor,
    offsetY: offsetConfig.y * factor,
    opacity: null,
  };
}
```

### 3.8 Combined Animation Computer

A single entry point that takes an array of animations and merges results:

```ts
import type { LayerAnimation } from '../types';

export function computeAnimations(
  animations: LayerAnimation[],
  elapsed: number,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number
): AnimationResult {
  let totalOffsetX = 0;
  let totalOffsetY = 0;
  let mergedOpacity: number | null = null;

  for (const anim of animations) {
    let result: AnimationResult;
    switch (anim.type) {
      case 'bounce':
        result = computeBounce(anim, elapsed);
        break;
      case 'carousel':
        result = computeCarousel(anim, elapsed, baseWidth, baseHeight, layerWidth, layerHeight);
        break;
      case 'fade':
        result = computeFade(anim, elapsed);
        break;
      case 'wobble':
        result = computeWobble(anim, elapsed);
        break;
    }

    totalOffsetX += result.offsetX;
    totalOffsetY += result.offsetY;

    if (result.opacity !== null) {
      // Multiple fade animations: multiply their opacities
      mergedOpacity = (mergedOpacity ?? 1) * result.opacity;
    }
  }

  return {
    offsetX: totalOffsetX,
    offsetY: totalOffsetY,
    opacity: mergedOpacity,
  };
}
```

**Merge strategy:**
- **Position offsets**: additive. Bounce + wobble offsets stack.
- **Opacity**: multiplicative. If two fades run in parallel, their opacities multiply (e.g., 0.5 * 0.8 = 0.4). This prevents opacity from exceeding 1.

Export from this file: `computeAnimations` and `AnimationResult`.

## Step 4: Create `useLayerAnimation` Hook

Create new file `packages/interactive-map/src/hooks/useLayerAnimation.ts`.

This hook drives the animation loop using R3F's `useFrame`. It accumulates its own elapsed time from `delta` (automatically pauses when the tab is hidden since `useFrame` stops firing).

```ts
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh, MeshBasicMaterial } from 'three';
import type { LayerAnimation } from '../types';
import { computeAnimations } from '../utils/animation';

interface UseLayerAnimationOptions {
  animations: LayerAnimation[];
  basePosition: { x: number; y: number };
  baseWidth: number;
  baseHeight: number;
  layerWidth: number;
  layerHeight: number;
}

export function useLayerAnimation(
  meshRef: React.RefObject<Mesh | null>,
  options: UseLayerAnimationOptions
) {
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current || options.animations.length === 0) return;

    // Cap delta to prevent huge jumps if frame takes too long (e.g., tab just became visible)
    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const result = computeAnimations(
      options.animations,
      elapsed.current,
      options.baseWidth,
      options.baseHeight,
      options.layerWidth,
      options.layerHeight
    );

    // Apply position offset (base position + animation offset)
    meshRef.current.position.x = options.basePosition.x + result.offsetX;
    meshRef.current.position.y = options.basePosition.y + result.offsetY;
    // z position stays unchanged (set by zIndex)

    // Apply opacity
    if (result.opacity !== null) {
      const material = meshRef.current.material as MeshBasicMaterial;
      material.opacity = result.opacity;
    }
  });
}
```

**Key design decisions:**
- **Delta accumulation** instead of `clock.getElapsedTime()`: Using `delta` from `useFrame` means elapsed time automatically pauses when the tab is hidden (since `useFrame` callbacks stop firing). No need for `visibilitychange` listeners.
- **Delta cap** (`Math.min(delta, 0.1)`): When the tab regains focus, the first `delta` can be very large (seconds of accumulated time). Capping prevents a jarring jump.
- **Direct mesh mutation** instead of React state: We mutate `mesh.position` and `material.opacity` directly inside `useFrame` for maximum performance. No React re-renders per frame.

## Step 5: Update `MapLayerMesh`

Update `packages/interactive-map/src/components/MapLayerMesh.tsx`.

The component needs to:
1. Accept animation config and base image dimensions
2. Create a `ref` for the mesh
3. Call `useLayerAnimation` with the ref
4. Ensure `transparent` is set on the material (already is)

### 5.1 Updated Props

```ts
import type { LayerAnimation } from '../types';

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  animation?: LayerAnimation[];
  baseWidth: number;
  baseHeight: number;
}
```

### 5.2 Updated Component

```tsx
import { useLoader, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { LinearFilter, TextureLoader, Mesh } from "three";
import type { LayerAnimation } from "../types";
import { useLayerAnimation } from "../hooks/useLayerAnimation";

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  animation?: LayerAnimation[];
  baseWidth: number;
  baseHeight: number;
}

export function MapLayerMesh({
  src,
  zIndex,
  position,
  animation,
  baseWidth,
  baseHeight,
}: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);
  const meshRef = useRef<Mesh>(null);

  const processedTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);

  const textureWidth = texture.image.width;
  const textureHeight = texture.image.height;
  const basePos = { x: position?.x ?? 0, y: position?.y ?? 0 };
  const animations = animation ?? [];

  useLayerAnimation(meshRef, {
    animations,
    basePosition: basePos,
    baseWidth,
    baseHeight,
    layerWidth: textureWidth,
    layerHeight: textureHeight,
  });

  return (
    <mesh
      ref={meshRef}
      position={[basePos.x, basePos.y, zIndex * 0.01]}
    >
      <planeGeometry args={[textureWidth, textureHeight]} />
      <meshBasicMaterial map={processedTexture} transparent />
    </mesh>
  );
}
```

**Important:** The initial `position` prop on the `<mesh>` sets the starting position. The `useLayerAnimation` hook then takes over and sets `position.x` and `position.y` every frame (keeping `position.z` unchanged). For layers with no animations, the hook's `useFrame` callback returns early immediately — negligible performance cost.

## Step 6: Update `MapScene`

Update `packages/interactive-map/src/components/MapScene.tsx`.

Pass `baseWidth`, `baseHeight`, and `animation` to each `MapLayerMesh`.

```tsx
import type { MapLayer, PanConfig, ZoomConfig } from "../types";
import { CameraController } from "./CameraController";
import { MapLayerMesh } from "./MapLayerMesh";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;
}

export function MapScene({
  layers,
  baseWidth,
  baseHeight,
  panConfig,
  zoomConfig,
}: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
      />
      {sortedLayers.map((layer) => {
        // Normalize animation to always be an array (or undefined)
        const animationArray = layer.animation
          ? Array.isArray(layer.animation)
            ? layer.animation
            : [layer.animation]
          : undefined;

        return (
          <MapLayerMesh
            key={layer.id}
            src={layer.src}
            zIndex={layer.zIndex}
            position={layer.position}
            animation={animationArray}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
          />
        );
      })}
    </>
  );
}
```

**Key change:** The `animation` field on `MapLayer` accepts either a single `LayerAnimation` or an array. `MapScene` normalizes it to an array before passing to `MapLayerMesh`. This keeps `MapLayerMesh` simple (always receives an array).

## Step 7: Update Barrel Exports

Update `packages/interactive-map/src/index.ts` to export the new types:

```ts
export { InteractiveMap } from "./components/InteractiveMap";
export type {
  InteractiveMapProps,
  MapLayer,
  PanConfig,
  ZoomConfig,
  LayerAnimation,
  BounceAnimation,
  CarouselAnimation,
  FadeAnimation,
  WobbleAnimation,
  EasingConfig,
  EasingPreset,
} from "./types";
```

No changes needed to `InteractiveMap.tsx` — it already passes `layers` (which now include `animation`) through to `MapScene`.

## Step 8: Update Demo App

Update `apps/demo/src/app/page.tsx` to demonstrate all animation types:

```tsx
import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: 100 },
    animation: [
      { type: "bounce" as const, direction: { x: 0, y: 1 }, amplitude: 15, duration: 2, easing: "ease-in-out" as const },
      { type: "fade" as const, minOpacity: 0.4, maxOpacity: 1, duration: 3 },
    ],
  },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 2, initialZoom: 1.4 }}
      />
    </main>
  );
}
```

This demonstrates parallel animation chaining: the overlay bounces vertically while fading in and out.

## Step 9: Verify

1. Run `pnpm dev` from the repo root
2. Open `http://localhost:3000` in a browser
3. Verify:
   - **Bounce**: Overlay layer oscillates along its configured direction with smooth easing
   - **Fade**: Overlay opacity smoothly transitions between minOpacity and maxOpacity
   - **Parallel chaining**: Bounce and fade run simultaneously on the same layer without conflict
   - **Easing**: Animations use the configured easing curve (visually smooth, not linear unless specified)
   - **Pan/Zoom unaffected**: Pan and zoom controls work exactly as before. Animated layers move with the camera (they are children of the scene, not the camera)
   - **Tab visibility pause**: Switch to another tab for 5+ seconds, switch back — animations should resume smoothly without a jarring jump
   - **No console errors**
4. Manually test carousel and wobble by temporarily changing the demo config:
   - **Carousel wrap**: Set animation to `{ type: "carousel", direction: { x: 1, y: 0 }, speed: 50, mode: "wrap" }`. The layer should scroll rightward and seamlessly re-enter from the left after exiting the base image bounds.
   - **Carousel infinite**: Change mode to `"infinite"`. The layer should keep moving right and eventually disappear.
   - **Wobble**: Set animation to `{ type: "wobble", offset: { x: 20, y: 0 }, duration: 2 }`. The layer should sway horizontally around its base position.
5. Run `pnpm --filter @interactive-map/core tsc --noEmit` — no TypeScript errors

# Acceptance Criteria

- [ ] `BounceAnimation`, `CarouselAnimation`, `FadeAnimation`, `WobbleAnimation` types are exported
- [ ] `EasingConfig` and `EasingPreset` types are exported
- [ ] `MapLayer` accepts `animation` as a single animation or array of animations
- [ ] Bounce oscillates along a configurable direction with configurable amplitude, duration, and easing
- [ ] Carousel moves a layer continuously in a direction at a constant speed
- [ ] Carousel `wrap` mode seamlessly wraps at base image bounds
- [ ] Carousel `infinite` mode moves the layer indefinitely in one direction
- [ ] Fade oscillates opacity between `minOpacity` and `maxOpacity` with configurable duration and easing
- [ ] Wobble sways the layer between `-offset` and `+offset` around its base position
- [ ] Parallel chaining works: multiple animations on the same layer run simultaneously
- [ ] Position offsets from parallel animations are additive
- [ ] Opacity from parallel fade animations is multiplicative
- [ ] Each animation has its own independent easing function
- [ ] Named easing presets work: `linear`, `ease-in`, `ease-out`, `ease-in-out`
- [ ] Custom cubic-bezier easing works: `[x1, y1, x2, y2]` tuple
- [ ] Animations auto-pause when the browser tab is hidden (no CPU usage)
- [ ] Animations resume smoothly after tab becomes visible (no jump)
- [ ] Layers without animations render and behave exactly as before (no regression)
- [ ] Pan and zoom controls work correctly with animated layers
- [ ] No React re-renders per frame (direct mesh/material mutation only)
- [ ] TypeScript compiles with no errors (`tsc --noEmit`)
- [ ] No console errors during interactions

# Review Fixes

The following issues were found during code review. Fix all of them on the existing branch.

## Fix 1 (Medium): Diagonal carousel wrapping produces zigzag instead of straight-line movement

**File:** `packages/interactive-map/src/utils/animation.ts`

**Problem:** In `computeCarousel`, X and Y axes are wrapped independently using `wrapCentered`. If the direction is diagonal (e.g., `{ x: 1, y: 1 }`) and the base image is not square (`baseWidth + layerWidth !== baseHeight + layerHeight`), the X axis wraps at a different cycle length than Y. This causes the layer to break out of its straight-line path and zigzag.

For example, with `direction: { x: 1, y: 1 }`, `baseWidth=1000, layerWidth=200` (wrapDistX=1200) and `baseHeight=600, layerHeight=200` (wrapDistY=800): X wraps every 1200/0.707 ≈ 1697 units of displacement, Y wraps every 800/0.707 ≈ 1131 units. After Y wraps but before X wraps, the layer jumps diagonally.

**Fix:** Compute wrapping as a single scalar displacement along the movement direction, then re-project to X/Y. Replace the per-axis wrapping block in `computeCarousel`:

```ts
if (mode === "wrap") {
  const wrapDistX = baseWidth + layerWidth;
  const wrapDistY = baseHeight + layerHeight;

  // Compute wrap cycle length along the direction vector.
  // The layer must travel far enough that it fully exits the bounds on every active axis.
  // Use the axis that requires the longest travel distance.
  const axisContribX =
    Math.abs(direction.x) > 0 ? wrapDistX / Math.abs(direction.x) : Infinity;
  const axisContribY =
    Math.abs(direction.y) > 0 ? wrapDistY / Math.abs(direction.y) : Infinity;
  const wrapCycleLength = Math.min(axisContribX, axisContribY);

  // Wrap the scalar displacement, then re-project to X/Y
  const wrappedDisplacement = wrapCentered(displacement, wrapCycleLength);
  offsetX = direction.x * wrappedDisplacement;
  offsetY = direction.y * wrappedDisplacement;
}
```

This ensures:
- The layer always moves in a straight line along its direction vector
- Wrapping happens as a single scalar value, so X and Y stay in sync
- `Math.min` picks the tighter axis so the layer fully exits before re-entering on the smaller dimension

## Fix 2 (Minor): `resolveEasing` allocates a new closure every frame

**Files:** `packages/interactive-map/src/utils/animation.ts`, `packages/interactive-map/src/hooks/useLayerAnimation.ts`

**Problem:** `resolveEasing(animation.easing)` is called inside `computeBounce`, `computeFade`, and `computeWobble`. Since these run via `useFrame` at ~60fps, a new closure is allocated every frame per animation. With multiple animated layers, this creates unnecessary GC pressure.

**Fix:** Cache the resolved easing functions in `useLayerAnimation` using `useMemo`, and pass them through to the compute utilities.

**Step 1:** Update `useLayerAnimation.ts` to pre-resolve easings:

```ts
import { useMemo, useRef } from "react";
import { resolveEasing } from "../utils/easing";

export function useLayerAnimation(
  meshRef: RefObject<Mesh | null>,
  options: UseLayerAnimationOptions
) {
  const elapsed = useRef(0);

  // Pre-resolve easing functions — only re-created when animation config changes
  const resolvedEasings = useMemo(
    () =>
      options.animations.map((anim) =>
        "easing" in anim ? resolveEasing(anim.easing) : undefined
      ),
    [options.animations]
  );

  useFrame((_, delta) => {
    if (!meshRef.current || options.animations.length === 0) return;

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
```

**Step 2:** Update `computeAnimations` in `animation.ts` to accept and forward pre-resolved easings:

```ts
export function computeAnimations(
  animations: LayerAnimation[],
  elapsed: number,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number,
  resolvedEasings?: (((t: number) => number) | undefined)[]
): AnimationResult {
  // ... existing setup ...

  for (let i = 0; i < animations.length; i++) {
    const animation = animations[i];
    const easingFn = resolvedEasings?.[i];
    let result: AnimationResult;

    switch (animation.type) {
      case "bounce":
        result = computeBounce(animation, elapsed, easingFn);
        break;
      case "carousel":
        result = computeCarousel(animation, elapsed, baseWidth, baseHeight, layerWidth, layerHeight);
        break;
      case "fade":
        result = computeFade(animation, elapsed, easingFn);
        break;
      case "wobble":
        result = computeWobble(animation, elapsed, easingFn);
        break;
    }

    // ... existing merge logic ...
  }

  return { offsetX: totalOffsetX, offsetY: totalOffsetY, opacity: mergedOpacity };
}
```

**Step 3:** Update `computeBounce`, `computeFade`, and `computeWobble` to accept an optional pre-resolved easing function:

```ts
// Example for computeBounce (same pattern for computeFade and computeWobble):
export function computeBounce(
  animation: BounceAnimation,
  elapsed: number,
  preResolvedEasing?: (t: number) => number
): AnimationResult {
  const direction = normalizeDirection(animation.direction ?? { x: 0, y: 1 });
  const amplitude = animation.amplitude ?? 20;
  const duration = animation.duration ?? 1;
  const easingFn = preResolvedEasing ?? resolveEasing(animation.easing);

  // ... rest unchanged
}
```

This keeps the API backward-compatible (functions still work without pre-resolved easings) while eliminating per-frame closure allocations when called from the hook.

# Log
- **2026-02-18**: Plan created for Chunk 5 — Layer Animations covering bounce, carousel, fade, wobble animation types with parallel chaining, easing system (named presets + cubic-bezier), tab visibility pause, and per-animation easing control.
- **2026-02-18**: Review fixes added — (1) Medium: compute carousel wrapping as scalar along direction vector to prevent zigzag on diagonal directions, (2) Minor: cache resolved easing functions in useMemo to avoid per-frame closure allocations.
