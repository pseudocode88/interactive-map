---
Name: Chunk 7c — Fog Effects
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief
Add a fog effect system to `InteractiveMap` that renders animated semi-transparent fog textures drifting across the map. Fog textures tile seamlessly for infinite scrolling. Each fog layer supports three composable visual modes: constant drift, opacity pulse (breathing), and scale breathing. Multiple independent fog layers can coexist with different textures, speeds, directions, and depths. Fog participates in the existing parallax system.

# Plan & Instruction

## Step 1: Define Types

File: `packages/interactive-map/src/types/index.ts`

Add the following types **after** the `SpriteEffectConfig` interface:

```ts
export interface FogOpacityPulse {
  /** Minimum opacity during the pulse cycle. Default: 0.3 */
  minOpacity?: number;
  /** Maximum opacity during the pulse cycle. Default: 0.8 */
  maxOpacity?: number;
  /** Duration of one full pulse cycle (min → max → min) in seconds. Default: 4 */
  duration?: number;
  /** Easing function for the opacity pulse. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface FogScaleBreathing {
  /** Maximum additional scale factor (fog grows by this amount above 1.0). Default: 0.1 (i.e., scales between 1.0 and 1.1) */
  amplitude?: number;
  /** Duration of one full breathing cycle in seconds. Default: 6 */
  duration?: number;
  /** Easing function for the scale breathing. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface FogEffectConfig {
  /** Unique ID for this fog layer */
  id: string;
  /** URL to the fog texture image (PNG). Should be seamlessly tileable for best results. */
  src: string;
  /** Position offset in base image pixel coordinates. Default: { x: 0, y: 0 } */
  position?: { x?: number; y?: number };
  /** Drift direction as a normalized vector. Default: { x: 1, y: 0 } (left-to-right) */
  direction?: { x: number; y: number };
  /** Drift speed in pixels per second. Default: 20 */
  speed?: number;
  /** Base opacity of the fog (0–1). Default: 0.5. If opacityPulse is provided, this is ignored in favor of the pulse range. */
  opacity?: number;
  /** Optional opacity pulse (breathing) effect. */
  opacityPulse?: FogOpacityPulse;
  /** Optional scale breathing effect. */
  scaleBreathing?: FogScaleBreathing;
  /** zIndex for depth ordering (same system as MapLayer). Default: 9 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this fog layer.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
}
```

Add `fogEffects` to `InteractiveMapProps`:

```ts
export interface InteractiveMapProps {
  // ... existing props ...
  /** Array of fog effect configurations */
  fogEffects?: FogEffectConfig[];
}
```

## Step 2: Create Fog Math Utility

File: `packages/interactive-map/src/utils/fog.ts` (new file)

This utility contains pure math functions for fog drift, opacity pulse, and scale breathing calculations. Keeping these pure makes them testable and consistent with the existing `animation.ts` / `spriteInstances.ts` pattern.

```ts
import type { FogOpacityPulse, FogScaleBreathing } from "../types";

/**
 * Compute the fog drift offset at a given elapsed time.
 * The fog tiles seamlessly, so the offset wraps based on texture dimensions.
 *
 * @param elapsed - Total elapsed time in seconds
 * @param speed - Drift speed in px/sec
 * @param directionX - Normalized X component of drift direction
 * @param directionY - Normalized Y component of drift direction
 * @param textureWidth - Width of the fog texture in pixels
 * @param textureHeight - Height of the fog texture in pixels
 * @returns { offsetX, offsetY } - The current drift offset in pixels (wrapped to texture bounds)
 */
export function computeFogDrift(
  elapsed: number,
  speed: number,
  directionX: number,
  directionY: number,
  textureWidth: number,
  textureHeight: number
): { offsetX: number; offsetY: number } {
  const rawX = elapsed * speed * directionX;
  const rawY = elapsed * speed * directionY;

  // Wrap within texture dimensions so the UV offset stays in [0, 1) range
  const offsetX = textureWidth > 0 ? ((rawX % textureWidth) + textureWidth) % textureWidth : 0;
  const offsetY = textureHeight > 0 ? ((rawY % textureHeight) + textureHeight) % textureHeight : 0;

  return { offsetX, offsetY };
}

/**
 * Compute the current opacity for a fog opacity pulse effect.
 *
 * @param elapsed - Total elapsed time in seconds
 * @param pulse - Opacity pulse config
 * @param easingFn - Resolved easing function (t: number) => number
 * @returns Current opacity value
 */
export function computeFogOpacity(
  elapsed: number,
  pulse: Required<Pick<FogOpacityPulse, "minOpacity" | "maxOpacity" | "duration">>,
  easingFn: (t: number) => number
): number {
  const { minOpacity, maxOpacity, duration } = pulse;
  // t goes 0 → 1 → 0 over one cycle (triangle wave via sin)
  const phase = (elapsed % duration) / duration;
  const t = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // 0→1→0 per cycle
  const eased = easingFn(t);
  return minOpacity + (maxOpacity - minOpacity) * eased;
}

/**
 * Compute the current scale for a fog scale breathing effect.
 *
 * @param elapsed - Total elapsed time in seconds
 * @param breathing - Scale breathing config
 * @param easingFn - Resolved easing function (t: number) => number
 * @returns Current scale multiplier (1.0 = no change)
 */
export function computeFogScale(
  elapsed: number,
  breathing: Required<Pick<FogScaleBreathing, "amplitude" | "duration">>,
  easingFn: (t: number) => number
): number {
  const { amplitude, duration } = breathing;
  const phase = (elapsed % duration) / duration;
  const t = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5; // 0→1→0 per cycle
  const eased = easingFn(t);
  return 1 + amplitude * eased;
}
```

## Step 3: Create `FogEffect` Component

File: `packages/interactive-map/src/components/FogEffect.tsx` (new file)

This is a React Three Fiber component that renders one fog layer as a tiling, drifting mesh.

**Props:**
```ts
interface FogEffectProps {
  config: FogEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}
```

**Implementation approach:**

1. **Load the fog texture** with `useLoader(TextureLoader, config.src)`. Set `colorSpace = SRGBColorSpace`, `minFilter = LinearFilter`, `magFilter = LinearFilter`.

2. **Enable seamless tiling**: Set `texture.wrapS = RepeatWrapping` and `texture.wrapT = RepeatWrapping`. This is the key difference from regular layers — it allows the texture to tile infinitely.

3. **Geometry sizing**: Use the fog texture's natural dimensions as the mesh size (consistent with `MapLayerMesh`). The mesh is a `<planeGeometry>` with `args={[textureWidth, textureHeight]}`.

4. **Drift via UV offset**: Instead of moving the mesh position (which would reveal edges), scroll the texture UVs. In `useFrame`:
   - Call `computeFogDrift()` to get the current drift offset.
   - Convert the pixel offset to UV space: `texture.offset.set(offsetX / textureWidth, offsetY / textureHeight)`.
   - Because `wrapS`/`wrapT` are set to `RepeatWrapping`, the texture tiles seamlessly as the offset increases.

5. **Opacity**:
   - If `opacityPulse` is configured, call `computeFogOpacity()` each frame and set `material.opacity`.
   - Otherwise use `config.opacity ?? 0.5` as constant opacity.

6. **Scale breathing**:
   - If `scaleBreathing` is configured, call `computeFogScale()` each frame and multiply it into the mesh scale.

7. **Parallax**: Apply the same parallax logic as `MapLayerMesh`:
   - Pan offset: `viewport.x * (1 - parallaxFactor)` / `viewport.y * (1 - parallaxFactor)` added to mesh position.
   - Drift mode: additional zoom-based positional offset.
   - Depth mode: scale the mesh by `layerZoom / baseZoom`.

8. **Easing**: Use `useMemo` to resolve easing functions for opacity pulse and scale breathing via the existing `resolveEasing()` utility. Default easing is `'ease-in-out'`.

9. **Z-positioning**: `mesh.position.z = (config.zIndex ?? 9) * 0.01`.

**Full component skeleton:**

```tsx
import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  LinearFilter,
  Mesh,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import type { FogEffectConfig } from "../types";
import { resolveEasing } from "../utils/easing";
import { computeFogDrift, computeFogOpacity, computeFogScale } from "../utils/fog";
import { computeParallaxScale } from "../utils/parallax";

interface FogEffectProps {
  config: FogEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

export function FogEffect({
  config,
  baseWidth,
  baseHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
}: FogEffectProps) {
  const texture = useLoader(TextureLoader, config.src);
  const meshRef = useRef<Mesh>(null);
  const elapsed = useRef(0);

  const textureWidth = texture.image.width;
  const textureHeight = texture.image.height;

  const processedTexture = useMemo(() => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [texture]);

  // Normalize the drift direction
  const direction = useMemo(() => {
    const dx = config.direction?.x ?? 1;
    const dy = config.direction?.y ?? 0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }, [config.direction?.x, config.direction?.y]);

  const speed = config.speed ?? 20;
  const baseOpacity = config.opacity ?? 0.5;
  const zIndex = config.zIndex ?? 9;
  const basePosition = {
    x: config.position?.x ?? 0,
    y: config.position?.y ?? 0,
  };

  // Resolve easing for sub-effects
  const opacityEasing = useMemo(
    () => (config.opacityPulse ? resolveEasing(config.opacityPulse.easing) : undefined),
    [config.opacityPulse?.easing]
  );
  /* Note: resolveEasing is imported from utils/easing.ts. It accepts EasingConfig | undefined
     and returns an (t: number) => number function. For undefined it returns the default ease-in-out. */

  const scaleEasing = useMemo(
    () => (config.scaleBreathing ? resolveEasing(config.scaleBreathing.easing) : undefined),
    [config.scaleBreathing?.easing]
  );

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    // --- Drift (UV offset) ---
    const drift = computeFogDrift(
      elapsed.current,
      speed,
      direction.x,
      direction.y,
      textureWidth,
      textureHeight
    );
    processedTexture.offset.set(
      drift.offsetX / textureWidth,
      drift.offsetY / textureHeight
    );

    // --- Opacity ---
    const material = meshRef.current.material;
    if ("opacity" in material) {
      if (config.opacityPulse && opacityEasing) {
        material.opacity = computeFogOpacity(
          elapsed.current,
          {
            minOpacity: config.opacityPulse.minOpacity ?? 0.3,
            maxOpacity: config.opacityPulse.maxOpacity ?? 0.8,
            duration: config.opacityPulse.duration ?? 4,
          },
          opacityEasing
        );
      } else {
        material.opacity = baseOpacity;
      }
    }

    // --- Parallax pan offset ---
    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const panOffsetX = viewport.x * (1 - parallaxFactor);
    const panOffsetY = viewport.y * (1 - parallaxFactor);

    let x = basePosition.x + panOffsetX;
    let y = basePosition.y + panOffsetY;

    if (parallaxMode === "drift" && parallaxFactor !== 1) {
      const driftStrength = 0.1;
      const zoomDrift = (viewport.zoom - 1) * (parallaxFactor - 1) * driftStrength;
      x += viewport.x * zoomDrift;
      y += viewport.y * zoomDrift;
    }

    meshRef.current.position.x = x;
    meshRef.current.position.y = y;

    // --- Scale: parallax depth + scale breathing ---
    let scaleX = 1;
    let scaleY = 1;

    if (parallaxMode === "depth" && parallaxFactor !== 1) {
      const baseZoom = Math.max(0.001, viewport.zoom);
      const zoomFactor = computeParallaxScale(parallaxFactor, parallaxMode);
      const layerZoom = Math.max(0.001, 1 + (baseZoom - 1) * zoomFactor);
      const depthScale = layerZoom / baseZoom;
      scaleX *= depthScale;
      scaleY *= depthScale;
    }

    if (config.scaleBreathing && scaleEasing) {
      const breathScale = computeFogScale(
        elapsed.current,
        {
          amplitude: config.scaleBreathing.amplitude ?? 0.1,
          duration: config.scaleBreathing.duration ?? 6,
        },
        scaleEasing
      );
      scaleX *= breathScale;
      scaleY *= breathScale;
    }

    meshRef.current.scale.set(scaleX, scaleY, 1);
  });

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[textureWidth, textureHeight]} />
      <meshBasicMaterial map={processedTexture} transparent opacity={baseOpacity} />
    </mesh>
  );
}
```

## Step 4: Integrate into `MapScene`

File: `packages/interactive-map/src/components/MapScene.tsx`

**Changes:**

1. Import `FogEffect` component and `FogEffectConfig` type.
2. Add `fogEffects?: FogEffectConfig[]` to `MapSceneProps`.
3. Render fog effects after layers but before sprite effects and markers. Fog is typically a background/mid-ground overlay, so it should render below sprites and markers but above regular map layers.

Add this block after the `sortedLayers.map(...)` section and before the `spriteEffects` section:

```tsx
{(fogEffects ?? []).map((fog) => {
  const parallaxFactor =
    !parallaxConfig || fog.parallaxFactor !== undefined
      ? (fog.parallaxFactor ?? 1)
      : computeParallaxFactor(
          {
            id: fog.id,
            src: fog.src,
            zIndex: fog.zIndex ?? 9,
            parallaxFactor: fog.parallaxFactor,
          },
          baseLayerZIndex,
          parallaxConfig.intensity
        );

  return (
    <FogEffect
      key={fog.id}
      config={fog}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
      parallaxFactor={parallaxFactor}
      parallaxMode={parallaxConfig?.mode}
      viewportRef={viewportRef}
    />
  );
})}
```

## Step 5: Wire Through `InteractiveMap`

File: `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Accept `fogEffects` from `InteractiveMapProps`.
2. Pass `fogEffects` down to `MapScene`.

## Step 6: Update Barrel Exports

File: `packages/interactive-map/src/index.ts`

Export the new types:
- `FogEffectConfig`
- `FogOpacityPulse`
- `FogScaleBreathing`

No need to export the `FogEffect` component (it's internal).

## Step 7: Add Demo

File: `apps/demo` — update the demo page to include a fog effect.

1. Add a sample fog texture to `apps/demo/public/` (a semi-transparent tileable cloud/mist PNG). If no asset is available, create a minimal placeholder or document how users should provide their own tileable fog texture.

2. Add a `fogEffects` config to the demo `InteractiveMap` usage:

```tsx
fogEffects={[
  {
    id: "mist",
    src: "/fog-texture.png",
    speed: 15,
    direction: { x: 1, y: 0.2 },
    opacity: 0.4,
    opacityPulse: {
      minOpacity: 0.2,
      maxOpacity: 0.5,
      duration: 5,
      easing: "ease-in-out",
    },
    scaleBreathing: {
      amplitude: 0.08,
      duration: 7,
      easing: "ease-in-out",
    },
    zIndex: 9,
  },
]}
```

# Acceptance Criteria

1. `fogEffects` prop is accepted by `InteractiveMap` and typed as `FogEffectConfig[]`.
2. Fog renders as a semi-transparent textured overlay on the map canvas.
3. Fog texture tiles seamlessly using `RepeatWrapping` — no visible seams or edges during drift.
4. Fog drifts continuously in the configured direction at the configured speed via UV offset scrolling.
5. Multiple fog layers can coexist with different textures, speeds, directions, and depths.
6. Opacity pulse (when configured) smoothly oscillates the fog opacity between `minOpacity` and `maxOpacity` over the specified duration.
7. Scale breathing (when configured) smoothly oscillates the fog mesh scale by the specified amplitude over the specified duration.
8. All three effects (drift, opacity pulse, scale breathing) can be composed together on a single fog layer.
9. Each sub-effect supports its own easing configuration via the existing `EasingConfig` system.
10. Fog participates in parallax when `parallaxConfig` is provided on the map (both depth and drift modes).
11. Fog region is determined by the texture's natural dimensions, positioned via `position.x` / `position.y`.
12. Performance: fog uses direct mesh/material mutation in `useFrame` (zero React re-renders), consistent with existing animation patterns.
13. Demo app shows fog effect in action (if asset is available).

# Log

- **2026-02-19 (Created):** Initial plan for fog effect system. Covers types (FogEffectConfig, FogOpacityPulse, FogScaleBreathing), fog math utility, FogEffect component with seamless tiling via RepeatWrapping, three composable visual modes (drift, opacity pulse, scale breathing), per-effect easing, parallax integration, MapScene/InteractiveMap wiring, barrel exports, and demo setup.
