---
Name: Pinned Animated Sprite
Type: Feature
Created On: 2026-02-21
Modified On: 2026-02-21
---

# Brief

Add support for fixed-position animated sprites (e.g. a waving flag) that are pinned to a specific
coordinate on the base map. Unlike the existing `SpriteEffect` (which spawns ambient moving sprites
like birds), a pinned sprite stays at a single world position, loops through sprite sheet frames,
and scales/pans with the map naturally.

Multiple independent pinned sprites can be configured, each with its own `src`, position, `fps`,
`scale`, `opacity`, and `zIndex`.

**Sprite sheet spec agreed for the flag:**
- Frame size: 128×128 px
- Grid: 4 cols × 2 rows → 512×256 px total sheet
- Frame count: 8 frames
- Animation: 8 fps, 1 s loop

---

# Plan & Instruction

## Step 1 — Add `PinnedSpriteConfig` type

**File:** `packages/interactive-map/src/types/index.ts`

Add the following interface **after** `SpriteEffectConfig`:

```ts
export interface PinnedSpriteConfig {
  /** Unique ID for this pinned sprite */
  id: string;
  /** URL to the sprite sheet PNG. Frames are auto-detected as a grid of square frames. */
  src: string;
  /** X position in base image pixel coordinates (0 = left edge) */
  x: number;
  /** Y position in base image pixel coordinates (0 = top edge) */
  y: number;
  /** Frames per second for sprite sheet animation. Default: 8 */
  fps?: number;
  /** zIndex for depth ordering (same system as MapLayer). Default: 10 */
  zIndex?: number;
  /**
   * Scale multiplier applied to the frame pixel size in world space.
   * displaySize = framePixelSize * scale.
   * Example: frame is 128 px, flag region is 72 px → scale ≈ 0.5625.
   * Default: 1
   */
  scale?: number;
  /** Opacity of the sprite (0–1). Default: 1 */
  opacity?: number;
}
```

---

## Step 2 — Add `pinnedSprites` to `InteractiveMapProps`

**File:** `packages/interactive-map/src/types/index.ts`

Inside `InteractiveMapProps`, add the optional field alongside `spriteEffects`:

```ts
pinnedSprites?: PinnedSpriteConfig[];
```

---

## Step 3 — Create `PinnedSprite.tsx` component

**File:** `packages/interactive-map/src/components/PinnedSprite.tsx` *(new file)*

```tsx
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import {
  LinearFilter,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import type { PinnedSpriteConfig } from "../types";
import { detectGrid, getFrameUV } from "../utils/spriteSheet";

interface PinnedSpriteProps {
  config: PinnedSpriteConfig;
  baseWidth: number;
  baseHeight: number;
}

export function PinnedSprite({ config, baseWidth, baseHeight }: PinnedSpriteProps) {
  const texture = useLoader(TextureLoader, config.src);
  const spriteRef = useRef<Sprite | null>(null);
  const frameRef = useRef(0);
  const frameTimerRef = useRef(0);

  // Convert base-image pixel coords to Three.js world coords (same formula as markers)
  const worldX = config.x - baseWidth / 2;
  const worldY = baseHeight / 2 - config.y;

  const sheetMeta = useMemo(() => {
    const image = texture.image as { width?: number; height?: number } | undefined;
    const width = image?.width ?? 1;
    const height = image?.height ?? 1;
    return detectGrid(width, height);
  }, [texture.image]);

  const instanceTexture = useMemo(() => {
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;

    const cloned = texture.clone();
    cloned.minFilter = LinearFilter;
    cloned.magFilter = LinearFilter;
    cloned.colorSpace = SRGBColorSpace;
    cloned.needsUpdate = true;
    return cloned;
  }, [texture]);

  useEffect(() => () => { instanceTexture.dispose(); }, [instanceTexture]);

  const fps = config.fps ?? 8;
  const scale = config.scale ?? 1;
  const opacity = config.opacity ?? 1;
  const zPosition = (config.zIndex ?? 10) * 0.01;

  useFrame((_, delta) => {
    const sprite = spriteRef.current;
    const material = sprite?.material as SpriteMaterial | undefined;
    const map = material?.map as Texture | null | undefined;
    if (!sprite || !material || !map) return;

    const cappedDelta = Math.min(delta, 0.1);
    const frameDuration = 1 / Math.max(1, fps);

    frameTimerRef.current += cappedDelta;
    while (frameTimerRef.current >= frameDuration) {
      frameTimerRef.current -= frameDuration;
      frameRef.current = (frameRef.current + 1) % sheetMeta.frameCount;
    }

    const uv = getFrameUV(frameRef.current, sheetMeta.cols, sheetMeta.rows);
    map.repeat.set(uv.repeatX, uv.repeatY);
    map.offset.set(uv.offsetX, uv.offsetY);

    sprite.position.set(worldX, worldY, zPosition);
    sprite.scale.set(
      sheetMeta.frameWidth * scale,
      sheetMeta.frameHeight * scale,
      1,
    );
  });

  return (
    <sprite
      ref={spriteRef}
      position={[worldX, worldY, zPosition]}
    >
      <spriteMaterial map={instanceTexture} transparent opacity={opacity} />
    </sprite>
  );
}
```

**Notes:**
- Reuses `detectGrid` and `getFrameUV` from existing utilities — no new utility needed.
- No velocity, oscillation, spawning, or parallax logic — this component is intentionally minimal.
- The sprite anchors at its **center** by default (Three.js `Sprite` behavior). The `x/y` config
  should target the visual center of the flag region on the base map.
- The sprite lives in world space so it pans and zooms with the map automatically.

---

## Step 4 — Add `pinnedSprites` prop to `MapScene`

**File:** `packages/interactive-map/src/components/MapScene.tsx`

### 4a — Add to `MapSceneProps` interface

Inside `MapSceneProps`, add alongside `spriteEffects`:

```ts
pinnedSprites?: PinnedSpriteConfig[];
```

Also add the import at the top of the file:
```ts
import type { ..., PinnedSpriteConfig } from "../types";
```

### 4b — Destructure in the component function signature

Add `pinnedSprites` to the destructured props.

### 4c — Import `PinnedSprite` component

```ts
import { PinnedSprite } from "./PinnedSprite";
```

### 4d — Render pinned sprites in JSX

Add the following block in the JSX return, placed **after** the existing `spriteEffects` render block:

```tsx
{(pinnedSprites ?? []).map((config) => (
  <PinnedSprite
    key={config.id}
    config={config}
    baseWidth={baseWidth}
    baseHeight={baseHeight}
  />
))}
```

---

## Step 5 — Pass `pinnedSprites` through `InteractiveMap` / `InteractiveMapContent`

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

Locate `InteractiveMapContent` (the internal component that resolves props and renders `MapScene`).

1. Destructure `pinnedSprites` from the incoming props.
2. Pass it directly to `<MapScene pinnedSprites={pinnedSprites} ... />`.

No default resolution needed — `undefined` is valid (renders nothing).

---

## Step 6 — Export `PinnedSpriteConfig` from the package

**File:** `packages/interactive-map/src/index.ts`

Add `PinnedSpriteConfig` to the existing type export list:

```ts
export type {
  // ... existing exports ...
  PinnedSpriteConfig,
} from "./types";
```

---

## Step 7 — Add `pinnedSprites` to `BuiltMapConfig` in the demo

**File:** `apps/demo/src/maps/types.ts`

Inside `BuiltMapConfig`, add alongside `spriteEffects`:

```ts
pinnedSprites: NonNullable<InteractiveMapProps["pinnedSprites"]>;
```

---

## Step 8 — Add `buildPinnedSprites` and flag config in `olympus.ts`

**File:** `apps/demo/src/maps/olympus.ts`

### 8a — Add `buildPinnedSprites` function

```ts
function buildPinnedSprites(
  isMobile: boolean,
  effectsEnabled: boolean,
): PinnedSpriteConfig[] {
  if (!effectsEnabled) {
    return [];
  }

  const mobileScale = isMobile ? 0.5 : 1;

  return [
    {
      id: "flag",
      src: "/flag.png",
      x: isMobile ? 900 * 0.5 : 900,   // adjust to actual flag position on the base map
      y: isMobile ? 1280 * 0.5 : 1280, // adjust to actual flag position on the base map
      fps: 8,
      zIndex: 2,
      scale: 0.5625 * mobileScale, // 72px display size from 128px frame (72/128 ≈ 0.5625)
      opacity: 1,
    },
  ];
}
```

> **Note:** The `x` and `y` values above use the castle marker position as a placeholder.
> Replace with the actual pixel coordinates of the flag on the base map image before finalising.

### 8b — Import `PinnedSpriteConfig`

Add to the existing import from `@interactive-map/core`:

```ts
import type {
  // ... existing imports ...
  PinnedSpriteConfig,
} from "@interactive-map/core";
```

### 8c — Include in `buildOlympusConfig`

Inside `buildOlympusConfig`, call the new function and add to the returned object:

```ts
pinnedSprites: buildPinnedSprites(isMobile, effectsEnabled),
```

### 8d — Spread into `InteractiveMap` in the demo page

**File:** wherever `buildOlympusConfig` result is spread into `<InteractiveMap>` props
(typically `apps/demo/src/app/page.tsx` or similar).

Ensure `pinnedSprites` is included in the spread:
```tsx
<InteractiveMap
  {...config}
  // pinnedSprites is already included via the spread if BuiltMapConfig is spread directly
/>
```

If props are passed individually, add:
```tsx
pinnedSprites={config.pinnedSprites}
```

---

## Step 9 — Add the flag sprite sheet asset

**File:** `apps/demo/public/flag.png`

- 512×256 px sprite sheet
- 4 columns × 2 rows
- Each frame: 128×128 px
- 8 frames of a waving flag animation

> This asset must be created by the designer and placed at `apps/demo/public/flag.png`
> before the feature is testable. The implementation can be merged before the asset is ready;
> the sprite will simply not render if the file is missing (Suspense will throw).

---

# Acceptance Criteria

- [ ] `PinnedSpriteConfig` type is exported from the package public API.
- [ ] `InteractiveMapProps` accepts an optional `pinnedSprites` array.
- [ ] Multiple pinned sprites can be defined, each with independent `src`, `x`, `y`, `fps`, `scale`, `opacity`, `zIndex`.
- [ ] Each pinned sprite renders at the correct world position (same coordinate system as markers).
- [ ] The animation loops through all sprite sheet frames at the configured fps.
- [ ] The sprite scales and pans with the map (zoom and pan behave identically to base map layers).
- [ ] The `flag` demo entry is present in `olympus.ts` and visible on the demo map when `effectsEnabled` is true and the asset exists.
- [ ] No regression in existing `SpriteEffect` (birds) behavior.
- [ ] TypeScript compiles with no errors.

---

# Log

- **2026-02-21** — Plan created. Feature scoped to a new dedicated `PinnedSprite` component
  (rather than extending `SpriteEffect`) to keep ambient and pinned sprite logic cleanly separated.
  Sprite sheet spec: 128×128 px frames, 4×2 grid (512×256 px), 8 frames at 8 fps.
