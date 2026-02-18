---
Name: Chunk 7a — Sprite Effects
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
Add a generic sprite effect system to `InteractiveMap` that renders animated sprite sheet entities (birds, butterflies, leaves, etc.) flying across the map on procedurally generated natural-looking paths. Sprites spawn at map edges, traverse the visible area with organic oscillation, and loop back. The system supports multiple independent sprite groups, frame-by-frame sprite sheet animation with auto-detected grid layout, and participates in the existing parallax system.

# Plan & Instruction

## Step 1: Define Types

File: `packages/interactive-map/src/types/index.ts`

Add the following types:

```ts
export interface SpriteEffectConfig {
  /** Unique ID for this sprite group */
  id: string;
  /** URL to the sprite sheet image (PNG). Frames are auto-detected as a grid. */
  src: string;
  /** Maximum number of sprites visible at a time. Default: 5 */
  maxCount?: number;
  /** Base movement speed in pixels per second. Default: 80 */
  speed?: number;
  /** Random speed variance factor (0–1). Each sprite gets speed ± speed*variance. Default: 0.2 */
  speedVariance?: number;
  /** General direction of movement as a normalized vector. Default: { x: 1, y: 0 } (left-to-right) */
  direction?: { x: number; y: number };
  /** Random angle variance in degrees applied per-sprite for natural spread. Default: 15 */
  directionVariance?: number;
  /** Vertical oscillation config for natural flight wobble */
  oscillation?: {
    /** Amplitude in pixels (how far up/down the sprite wobbles). Default: 15 */
    amplitude?: number;
    /** Frequency: number of full wobble cycles per second. Default: 0.8 */
    frequency?: number;
  };
  /** Frames per second for sprite sheet animation. Default: 8 */
  fps?: number;
  /** zIndex for depth ordering (same system as MapLayer). Default: 10 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this sprite group.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /** Scale multiplier for individual sprites. Default: 1 */
  scale?: number;
  /** Opacity of sprites (0–1). Default: 1 */
  opacity?: number;
}
```

Add `spriteEffects` to `InteractiveMapProps`:

```ts
export interface InteractiveMapProps {
  // ... existing props ...
  /** Array of sprite effect configurations (birds, butterflies, etc.) */
  spriteEffects?: SpriteEffectConfig[];
}
```

## Step 2: Create Sprite Sheet Utility

File: `packages/interactive-map/src/utils/spriteSheet.ts` (new file)

This utility handles auto-detection of sprite sheet grid layout and UV offset calculation.

**Logic:**
1. Load the texture. Read `texture.image.width` and `texture.image.height`.
2. Auto-detect grid: assume frames are square with side length = image height (single row sprite sheet). Compute `cols = Math.floor(imageWidth / imageHeight)`, `frameCount = cols`. If the image is taller than wide, assume a column layout: `rows = Math.floor(imageHeight / imageWidth)`, `frameCount = rows`.
3. Export a function `getFrameUV(frameIndex: number, cols: number, rows: number)` that returns `{ offsetX, offsetY, repeatX, repeatY }` for setting `texture.offset` and `texture.repeat` to display the correct frame.

```ts
export interface SpriteSheetMeta {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  frameCount: number;
}

/** Auto-detect grid layout from image dimensions. Assumes square frames. */
export function detectGrid(imageWidth: number, imageHeight: number): SpriteSheetMeta {
  // Assume frames are square, side = min(imageWidth, imageHeight)
  const frameSize = Math.min(imageWidth, imageHeight);
  const cols = Math.max(1, Math.floor(imageWidth / frameSize));
  const rows = Math.max(1, Math.floor(imageHeight / frameSize));
  return {
    frameWidth: frameSize,
    frameHeight: frameSize,
    cols,
    rows,
    frameCount: cols * rows,
  };
}

/** Get UV offset and repeat for a given frame index in a grid sprite sheet. */
export function getFrameUV(
  frameIndex: number,
  cols: number,
  rows: number
): { offsetX: number; offsetY: number; repeatX: number; repeatY: number } {
  const col = frameIndex % cols;
  // Three.js UV origin is bottom-left, so flip row
  const row = rows - 1 - Math.floor(frameIndex / cols);
  return {
    offsetX: col / cols,
    offsetY: row / rows,
    repeatX: 1 / cols,
    repeatY: 1 / rows,
  };
}
```

## Step 3: Create Sprite Instance Manager Utility

File: `packages/interactive-map/src/utils/spriteInstances.ts` (new file)

This utility manages the procedural lifecycle of individual sprite instances (spawn, move, despawn).

**Data structure per sprite instance:**
```ts
export interface SpriteInstance {
  /** Current position in world coordinates */
  x: number;
  y: number;
  /** Movement direction vector (normalized, with per-instance angle variance applied) */
  dx: number;
  dy: number;
  /** This instance's speed in px/sec (base speed with variance applied) */
  speed: number;
  /** Phase offset for oscillation (random, 0–2π) so sprites don't wobble in sync */
  oscillationPhase: number;
  /** Current sprite sheet frame index */
  frame: number;
  /** Accumulator for frame timing */
  frameTimer: number;
  /** Whether this instance is alive/visible */
  alive: boolean;
}
```

**Functions to implement:**

### `spawnInstance(config, baseWidth, baseHeight): SpriteInstance`
- Pick a random spawn edge based on the movement direction (opposite side from where they're heading).
  - For `direction: { x: 1, y: 0 }` (left-to-right), spawn on the left edge with random Y.
  - For diagonal directions, pick the most "upstream" edge.
- Apply `directionVariance`: rotate the base direction by a random angle within `±directionVariance` degrees.
- Apply `speedVariance`: `speed = baseSpeed * (1 + (Math.random() * 2 - 1) * variance)`.
- Random `oscillationPhase` between 0 and 2π.
- Start at `frame = 0`, `frameTimer = 0`.

### `updateInstance(instance, delta, config, baseWidth, baseHeight, frameCount): boolean`
- Move: `instance.x += instance.dx * instance.speed * delta`, same for y.
- Apply oscillation: compute perpendicular offset = `amplitude * sin(2π * frequency * totalTime + phase)`. The perpendicular direction is `{ -dy, dx }` relative to the movement direction.
- Advance frame timer: `instance.frameTimer += delta`. When `frameTimer >= 1/fps`, advance frame (wrapping), reset timer.
- Return `false` if the sprite has exited the map bounds (with margin equal to sprite size), meaning it should be despawned.

### `initializeInstances(config, baseWidth, baseHeight, count): SpriteInstance[]`
- Create `count` instances with staggered positions (not all at the spawn edge — scatter them across the map along their flight direction so it looks like an ongoing scene, not a simultaneous burst).

## Step 4: Create `SpriteEffect` Component

File: `packages/interactive-map/src/components/SpriteEffect.tsx` (new file)

This is a React Three Fiber component that renders one sprite group.

**Props:**
```ts
interface SpriteEffectProps {
  config: SpriteEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}
```

**Implementation approach:**
1. Load the sprite sheet texture with `useLoader(TextureLoader, config.src)`. Set `colorSpace = SRGBColorSpace`.
2. Use `detectGrid()` to get the frame layout from the loaded texture dimensions.
3. Use `useRef` to store a mutable array of `SpriteInstance` objects. Initialize with `initializeInstances()`.
4. For each sprite instance, render a `<sprite>` (Three.js Sprite) using a cloned material with its own UV offset. Store refs to all sprite meshes in an array ref.
5. In `useFrame(_, delta)`:
   - Cap delta at 0.1 (consistent with existing convention).
   - Loop through instances: call `updateInstance()`. If it returns false (exited bounds), respawn with `spawnInstance()`.
   - For each alive instance, update the corresponding sprite mesh:
     - Set `position.x` and `position.y` (including oscillation offset, parallax pan offset, parallax drift if applicable).
     - Update `material.map.offset` and `material.map.repeat` using `getFrameUV()` for the current frame.
     - Apply parallax scale if mode is "depth".
   - If alive instances < `maxCount`, spawn new ones (staggered with a small random delay to avoid bursts).
6. The `<sprite>` uses `<spriteMaterial>` with `map={clonedTexture}`, `transparent={true}`, `opacity={config.opacity}`.

**Important rendering details:**
- Each sprite instance needs its own cloned texture (via `texture.clone()`) so that UV offsets are independent. Clone once per instance at creation time.
- Set `sprite.position.z = config.zIndex * 0.01` (same z-mapping as layers).
- Flip the sprite's `scale.x` to negative if the sprite is moving leftward (so the bird faces its direction of travel). Determine this from `instance.dx`.
- Apply `config.scale` to the sprite scale: `scale.set(frameWidth * scale * xFlip, frameHeight * scale, 1)`.

## Step 5: Integrate into `MapScene`

File: `packages/interactive-map/src/components/MapScene.tsx`

**Changes:**
1. Import `SpriteEffect` component.
2. Accept `spriteEffects` in `MapSceneProps`.
3. Render sprite effects after layers but before markers (so markers are always on top):

```tsx
{(spriteEffects ?? []).map((effect) => {
  const parallaxFactor =
    !parallaxConfig || effect.parallaxFactor != null
      ? (effect.parallaxFactor ?? 1)
      : computeParallaxFactor(
          { zIndex: effect.zIndex ?? 10 } as MapLayer,
          baseLayerZIndex,
          parallaxConfig.intensity
        );

  return (
    <SpriteEffect
      key={effect.id}
      config={effect}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
      parallaxFactor={parallaxFactor}
      parallaxMode={parallaxConfig?.mode}
      viewportRef={viewportRef}
    />
  );
})}
```

## Step 6: Wire Through `InteractiveMap`

File: `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Accept `spriteEffects` from props.
2. Pass `spriteEffects` down to `MapScene`.

## Step 7: Update Barrel Exports

File: `packages/interactive-map/src/index.ts`

- Export `SpriteEffectConfig` type from `types/index.ts`.
- No need to export `SpriteEffect` component (it's internal).

## Step 8: Add Demo

File: `apps/demo` — update the demo page to include a sprite effect.

1. Add a sample bird sprite sheet image to `apps/demo/public/` (a simple placeholder — a small 4-frame bird silhouette sprite sheet, can be a minimal PNG).
2. Add a `spriteEffects` config to the demo `InteractiveMap` usage:

```tsx
spriteEffects={[
  {
    id: "birds",
    src: "/bird-spritesheet.png",
    maxCount: 4,
    speed: 100,
    speedVariance: 0.3,
    direction: { x: 1, y: -0.1 },
    directionVariance: 20,
    oscillation: { amplitude: 12, frequency: 0.6 },
    fps: 8,
    zIndex: 8,
    scale: 1,
  },
]}
```

**Note:** A placeholder sprite sheet asset will need to be sourced or created. If no asset is available, create a minimal 4-frame programmatic PNG (e.g., simple V-shapes representing bird silhouettes) or skip the demo asset and document how users should provide their own.

# Acceptance Criteria

1. `spriteEffects` prop is accepted by `InteractiveMap` and typed as `SpriteEffectConfig[]`.
2. Sprites render as animated sprite sheet frames on the map canvas.
3. Sprite sheet grid layout is auto-detected from image dimensions (assumes square frames).
4. Sprites spawn at map edges and fly across with natural-looking oscillation.
5. Sprite count respects `maxCount` — never more than `maxCount` sprites visible per group.
6. Multiple sprite groups can coexist (e.g., birds going left, butterflies going right).
7. Sprites flip horizontally to face their direction of travel.
8. Sprites participate in parallax when `parallaxConfig` is provided on the map.
9. Speed variance and direction variance produce organic, non-uniform movement.
10. Sprites despawn after exiting map bounds and respawn naturally (no sudden bursts).
11. Initial load scatters sprites across the map (not all starting at the edge).
12. Frame animation runs at the configured `fps`.
13. Performance: sprite instances use direct mesh mutation in `useFrame` (zero React re-renders), consistent with existing animation patterns.
14. Demo app shows sprite effects in action (if asset is available).

# Log

- **2026-02-18 (Created):** Initial plan for generic sprite effect system. Covers types, sprite sheet utility, instance lifecycle manager, SpriteEffect component, MapScene/InteractiveMap integration, barrel exports, and demo setup.
