---
Name: Chunk 8b — Mask-Aware Particle Spawning
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add mask texture support to the particle system (`ParticleEffectConfig`). Particles can be constrained to regions defined by an RGB mask image. The mask is sampled **on the CPU side** (via an offscreen canvas) to control particle spawning and/or movement. Two behaviors are configurable:

- **spawn-only**: Particles only spawn where the mask channel > 0, but can drift outside the region freely.
- **constrain**: Particles are killed and respawned if they move outside the masked region.
- **both**: Spawn within mask AND constrain movement to mask region.

This depends on **Chunk 8a** for the `MaskChannel` type and `useMaskTexture` pattern, but the CPU-side mask sampling is a separate system from the GPU shader masking in 8a.

# Plan & Instruction

## Step 1: Add Mask Fields to `ParticleEffectConfig`

**File:** `packages/interactive-map/src/types/index.ts`

Add these fields at the end of the `ParticleEffectConfig` interface (before the closing `}`):

```ts
  /**
   * Optional mask texture URL (PNG). When provided, particles are constrained
   * to regions where the specified mask channel has a non-zero value.
   * The mask image is loaded into an offscreen canvas for CPU-side pixel sampling.
   * The mask coordinates map to the particle region (or full map if no region).
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to sample. Default: "r".
   */
  maskChannel?: MaskChannel;
  /**
   * How the mask constrains particles:
   * - "spawn": Particles only spawn where mask > 0, but can drift freely. (Default)
   * - "constrain": Particles are respawned if they move to where mask = 0.
   * - "both": Spawn within mask AND constrain movement to mask region.
   */
  maskBehavior?: "spawn" | "constrain" | "both";
  /**
   * Minimum mask channel value (0–1) to consider a pixel as "inside" the region.
   * Default: 0.1 (anything above ~25/255 is considered inside).
   */
  maskThreshold?: number;
```

## Step 2: Create CPU-Side Mask Sampler Utility

**File:** `packages/interactive-map/src/utils/maskSampler.ts` (new file)

This utility loads a mask image into an offscreen canvas and provides fast pixel-level sampling.

```ts
import type { MaskChannel } from "../types";

/**
 * CPU-side mask sampler that reads pixel data from an offscreen canvas.
 * Used by the particle system to check spawn/constraint positions.
 */
export interface MaskSampler {
  /** Width of the mask image in pixels */
  width: number;
  /** Height of the mask image in pixels */
  height: number;
  /**
   * Sample the mask at the given coordinates.
   * @param x - X coordinate in mask pixel space (0 to width-1).
   * @param y - Y coordinate in mask pixel space (0 to height-1).
   * @param channel - Which channel to read ("r", "g", or "b").
   * @returns Channel value normalized to 0–1.
   */
  sample(x: number, y: number, channel: MaskChannel): number;
  /** Release the offscreen canvas resources. */
  dispose(): void;
}

const CHANNEL_OFFSETS: Record<MaskChannel, number> = {
  r: 0,
  g: 1,
  b: 2,
};

/**
 * Creates a MaskSampler from an already-loaded HTMLImageElement.
 * Draws the image onto an offscreen canvas and reads the pixel data once.
 */
export function createMaskSampler(image: HTMLImageElement): MaskSampler {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to get 2D context for mask sampler");
  }

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data; // Uint8ClampedArray: [R,G,B,A, R,G,B,A, ...]

  return {
    width: canvas.width,
    height: canvas.height,
    sample(x: number, y: number, channel: MaskChannel): number {
      // Clamp to valid range
      const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));
      const index = (py * canvas.width + px) * 4 + CHANNEL_OFFSETS[channel];
      return pixels[index] / 255;
    },
    dispose() {
      // Clear references to allow GC
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/**
 * Loads a mask image from a URL and creates a MaskSampler.
 * Returns a promise that resolves to the sampler.
 */
export function loadMaskSampler(src: string): Promise<MaskSampler> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(createMaskSampler(img));
    img.onerror = () => reject(new Error(`Failed to load mask image: ${src}`));
    img.src = src;
  });
}
```

## Step 3: Create `useMaskSampler` Hook

**File:** `packages/interactive-map/src/hooks/useMaskSampler.ts` (new file)

A React hook that loads and manages the MaskSampler lifecycle.

```ts
import { useEffect, useState } from "react";
import { loadMaskSampler, type MaskSampler } from "../utils/maskSampler";

/**
 * Loads a mask image and returns a CPU-side MaskSampler for pixel-level sampling.
 * Returns null while loading or if no src is provided.
 * Disposes the sampler on unmount or when src changes.
 */
export function useMaskSampler(src?: string): MaskSampler | null {
  const [sampler, setSampler] = useState<MaskSampler | null>(null);

  useEffect(() => {
    if (!src) {
      setSampler(null);
      return;
    }

    let cancelled = false;
    let loadedSampler: MaskSampler | null = null;

    loadMaskSampler(src)
      .then((s) => {
        if (cancelled) {
          s.dispose();
          return;
        }
        loadedSampler = s;
        setSampler(s);
      })
      .catch(() => {
        if (!cancelled) {
          setSampler(null);
        }
      });

    return () => {
      cancelled = true;
      if (loadedSampler) {
        loadedSampler.dispose();
      }
      setSampler(null);
    };
  }, [src]);

  return sampler;
}
```

## Step 4: Add Mask-Aware Spawn/Constrain Functions to Particle Utils

**File:** `packages/interactive-map/src/utils/particles.ts`

### 4a. Add mask sampling imports and helper

Add at the top of the file:

```ts
import type { MaskChannel } from "../types";
import type { MaskSampler } from "./maskSampler";
```

### 4b. Add `sampleMaskAtParticle` helper

Add this helper function (internal, not exported):

```ts
/**
 * Maps a particle's region-local position to mask pixel coordinates and samples.
 * The particle region (regionWidth x regionHeight) is mapped to the full mask image.
 *
 * @param particleX - Particle X in region-local coordinates (0 to regionWidth).
 * @param particleY - Particle Y in region-local coordinates (0 to regionHeight).
 * @param regionWidth - Width of the particle region.
 * @param regionHeight - Height of the particle region.
 * @param sampler - The mask sampler.
 * @param channel - Which channel to sample.
 * @returns Mask value (0–1) at the particle's position.
 */
function sampleMaskAtParticle(
  particleX: number,
  particleY: number,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel
): number {
  // Map region-local coords (0..regionWidth) to mask pixel coords (0..maskWidth)
  const maskX = (particleX / regionWidth) * sampler.width;
  const maskY = (particleY / regionHeight) * sampler.height;
  return sampler.sample(maskX, maskY, channel);
}
```

### 4c. Add `createMaskedParticle` function

This function creates a particle that spawns within the masked region. It retries random positions until it finds one inside the mask.

```ts
/**
 * Creates a particle that is guaranteed to spawn inside the masked region.
 * Tries random positions up to maxAttempts times, then falls back to any position.
 *
 * @param config - Particle effect configuration.
 * @param regionWidth - Width of the particle spawn region.
 * @param regionHeight - Height of the particle spawn region.
 * @param sampler - The mask sampler for checking positions.
 * @param channel - Which mask channel to check.
 * @param threshold - Minimum channel value to consider "inside". Default: 0.1.
 * @param maxAttempts - Max random position attempts. Default: 30.
 */
export function createMaskedParticle(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1,
  maxAttempts: number = 30
): ParticleInstance {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const particle = createParticle(config, regionWidth, regionHeight);
    const maskValue = sampleMaskAtParticle(
      particle.x,
      particle.y,
      regionWidth,
      regionHeight,
      sampler,
      channel
    );
    if (maskValue >= threshold) {
      return particle;
    }
  }

  // Fallback: return particle at any position if mask has no valid regions
  return createParticle(config, regionWidth, regionHeight);
}
```

### 4d. Add `initializeMaskedParticles` function

```ts
/**
 * Initializes particles with mask-aware spawning.
 * All particles are placed inside the masked region.
 */
export function initializeMaskedParticles(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  count: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): ParticleInstance[] {
  const safeCount = Math.max(0, Math.floor(count));
  const particles = Array.from({ length: safeCount }, () =>
    createMaskedParticle(config, regionWidth, regionHeight, sampler, channel, threshold)
  );

  const mode = config.mode ?? "twinkle";
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];

    if (mode === "twinkle") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      particle.alpha = Math.sin(t * Math.PI);
      continue;
    }

    // For drift mode, start at spawn position (already masked), travel a partial phase
    particle.distanceTraveled = particle.phase * particle.maxDistance;
    particle.alpha = Math.max(0, Math.min(1, 1 - particle.distanceTraveled / particle.maxDistance));
  }

  return particles;
}
```

### 4e. Add `isParticleInMask` helper (exported)

```ts
/**
 * Checks if a particle's current position is inside the masked region.
 *
 * @returns true if the mask channel value at the particle's position >= threshold.
 */
export function isParticleInMask(
  particle: ParticleInstance,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): boolean {
  const maskValue = sampleMaskAtParticle(
    particle.x,
    particle.y,
    regionWidth,
    regionHeight,
    sampler,
    channel
  );
  return maskValue >= threshold;
}
```

### 4f. Add mask-aware respawn to `updateTwinkleParticle`

Add a new variant that respawns within the mask:

```ts
/**
 * Updates a twinkle particle with mask-aware respawning.
 * When the particle's cycle completes, it respawns inside the masked region.
 */
export function updateMaskedTwinkleParticle(
  particle: ParticleInstance,
  delta: number,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  particle.elapsed += delta;

  const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
  if (completedCycles > 0) {
    particle.elapsed -= completedCycles * particle.cycleDuration;
    // Respawn inside mask
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      particle.x = Math.random() * Math.max(regionWidth, 0);
      particle.y = Math.random() * Math.max(regionHeight, 0);
      if (sampleMaskAtParticle(particle.x, particle.y, regionWidth, regionHeight, sampler, channel) >= threshold) {
        break;
      }
    }
  }

  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  particle.alpha = Math.sin(t * Math.PI);
}
```

### 4g. Add mask-constrained drift update

```ts
/**
 * Updates a drift particle with mask constraint checking.
 * If the particle drifts outside the mask, it is immediately respawned inside.
 */
export function updateMaskedDriftParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  const distanceDelta = particle.speed * delta;

  // Move the particle
  particle.x += particle.dx * distanceDelta;
  particle.y += particle.dy * distanceDelta;

  // Wrap coordinates
  particle.x = ((particle.x % regionWidth) + regionWidth) % regionWidth;
  particle.y = ((particle.y % regionHeight) + regionHeight) % regionHeight;

  particle.distanceTraveled += distanceDelta;
  particle.alpha = Math.max(0, Math.min(1, 1 - particle.distanceTraveled / particle.maxDistance));

  // Check if we need to respawn (distance exhausted OR outside mask)
  const outsideMask = !isParticleInMask(particle, regionWidth, regionHeight, sampler, channel, threshold);
  const distanceExhausted = particle.distanceTraveled >= particle.maxDistance;

  if (distanceExhausted || outsideMask) {
    // Respawn inside mask
    const temp = createMaskedParticle(config, regionWidth, regionHeight, sampler, channel, threshold);
    particle.x = temp.x;
    particle.y = temp.y;
    particle.distanceTraveled = 0;
    particle.maxDistance = Math.max(1, config.driftDistance ?? 100);
    particle.elapsed = 0;
    particle.dx = temp.dx;
    particle.dy = temp.dy;
    particle.speed = temp.speed;
    particle.alpha = 1;
  }
}
```

## Step 5: Integrate Mask into `ParticleEffect` Component

**File:** `packages/interactive-map/src/components/ParticleEffect.tsx`

### 5a. Add imports

```ts
import { useMaskSampler } from "../hooks/useMaskSampler";
import {
  initializeParticles,
  initializeMaskedParticles,
  updateDriftParticle,
  updateTwinkleParticle,
  updateMaskedDriftParticle,
  updateMaskedTwinkleParticle,
  isParticleInMask,
  createMaskedParticle,
  type ParticleInstance,
} from "../utils/particles";
```

### 5b. Load mask sampler

Inside the `ParticleEffect` component, add after existing hooks:

```ts
const maskSampler = useMaskSampler(config.maskSrc);
const maskChannel = config.maskChannel ?? "r";
const maskBehavior = config.maskBehavior ?? "spawn";
const maskThreshold = config.maskThreshold ?? 0.1;
const hasMask = !!maskSampler;
```

### 5c. Update particle initialization

Update the `useEffect` that initializes particles. When a mask sampler is available, use masked initialization:

```ts
useEffect(() => {
  const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
  const initialRegion = resolveParticleRegion(
    config,
    viewport,
    baseWidth,
    baseHeight,
    baseFrustumHalfWidth,
    baseFrustumHalfHeight,
    layerOffset
  );

  if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
    particlesRef.current = initializeMaskedParticles(
      config,
      initialRegion.width,
      initialRegion.height,
      maxCount,
      maskSampler,
      maskChannel,
      maskThreshold
    );
  } else {
    particlesRef.current = initializeParticles(
      config,
      initialRegion.width,
      initialRegion.height,
      maxCount
    );
  }
}, [
  // ... existing deps ...
  maskSampler,
  maskChannel,
  maskBehavior,
  maskThreshold,
]);
```

**Note:** Add `maskSampler`, `maskChannel`, `maskBehavior`, and `maskThreshold` to the dependency array.

### 5d. Update the `useFrame` particle update loop

In the `useFrame` callback, replace the mode-based update logic with mask-aware variants:

```ts
for (let index = 0; index < maxCount; index += 1) {
  let particle = particles[index];
  if (!particle) {
    if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
      particle = createMaskedParticle(config, region.width, region.height, maskSampler, maskChannel, maskThreshold);
    } else {
      particle = initializeParticles(config, region.width, region.height, 1)[0];
    }
    particles[index] = particle;
  }

  if (mode === "drift") {
    if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
      updateMaskedDriftParticle(particle, cappedDelta, config, region.width, region.height, maskSampler, maskChannel, maskThreshold);
    } else {
      updateDriftParticle(particle, cappedDelta, config, region.width, region.height);
    }
  } else {
    if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
      updateMaskedTwinkleParticle(particle, cappedDelta, region.width, region.height, maskSampler, maskChannel, maskThreshold);
    } else {
      updateTwinkleParticle(particle, cappedDelta, region.width, region.height);
    }
  }

  // ... rest of position/alpha/size array updates unchanged ...
}
```

**Logic summary:**
- `maskBehavior: "spawn"` → Uses `initializeMaskedParticles` + `createMaskedParticle` for spawning, but standard `updateDriftParticle`/`updateTwinkleParticle` for movement.
- `maskBehavior: "constrain"` → Uses standard `initializeParticles` for spawning, but `updateMaskedDriftParticle`/`updateMaskedTwinkleParticle` for movement (kills particles that leave mask).
- `maskBehavior: "both"` → Masked spawning AND masked movement.

## Step 6: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

### 6a. Export mask sampler utilities

```ts
export { createMaskSampler, loadMaskSampler, type MaskSampler } from "./utils/maskSampler";
export { useMaskSampler } from "./hooks/useMaskSampler";
```

### 6b. Export new particle functions

Add to existing particle exports (if any), or create new exports:

```ts
export {
  createMaskedParticle,
  initializeMaskedParticles,
  isParticleInMask,
  updateMaskedTwinkleParticle,
  updateMaskedDriftParticle,
} from "./utils/particles";
```

## Step 7: Demo — Masked Particle Effect

**File:** `apps/demo/src/app/page.tsx`

Add a masked particle effect using the same demo mask as Chunk 8a:

```tsx
// In the particleEffects array:
{
  id: "masked-sparkles",
  mode: "twinkle",
  maxCount: 80,
  color: "#66ffff",
  size: 4,
  sizeVariance: 0.4,
  twinkleDuration: 2.5,
  maskSrc: "/maps/demo-mask.png",
  maskChannel: "g",        // green regions
  maskBehavior: "both",    // spawn + constrain
  maskThreshold: 0.1,
  zIndex: 11,
},
{
  id: "masked-embers",
  mode: "drift",
  maxCount: 40,
  color: "#ff6633",
  size: 3,
  driftDirection: { x: 0, y: 1 },
  driftSpeed: 25,
  driftDistance: 80,
  maskSrc: "/maps/demo-mask.png",
  maskChannel: "b",        // blue regions
  maskBehavior: "spawn",   // spawn in mask, drift freely
  zIndex: 11,
},
```

# Acceptance Criteria

1. `ParticleEffectConfig` has optional `maskSrc`, `maskChannel`, `maskBehavior`, and `maskThreshold` fields.
2. A new `utils/maskSampler.ts` provides `createMaskSampler()` and `loadMaskSampler()` for CPU-side pixel sampling via an offscreen canvas.
3. A new `hooks/useMaskSampler.ts` provides the `useMaskSampler()` hook for React lifecycle management.
4. `maskBehavior: "spawn"` — particles only spawn where mask channel >= threshold, but move freely.
5. `maskBehavior: "constrain"` — particles spawn anywhere, but are respawned when they move outside the mask.
6. `maskBehavior: "both"` — particles spawn inside AND are constrained to the mask region.
7. Masked spawning retries up to 30 random positions before falling back (prevents infinite loops on sparse masks).
8. Mask pixel sampling maps the particle region to the full mask image dimensions (UV-style mapping).
9. The `MaskSampler` canvas is disposed on unmount or when `maskSrc` changes.
10. The mask sampler uses `willReadFrequently: true` for `getContext("2d")` to optimize repeated pixel reads.
11. Both `twinkle` and `drift` modes support mask-aware spawning and constraining.
12. New particle functions (`createMaskedParticle`, `initializeMaskedParticles`, `isParticleInMask`, `updateMaskedTwinkleParticle`, `updateMaskedDriftParticle`) are exported from the package.
13. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 8b — Mask-Aware Particle Spawning. Adds `maskSrc`, `maskChannel`, `maskBehavior`, and `maskThreshold` to `ParticleEffectConfig`. Implements CPU-side mask sampling via offscreen canvas (`MaskSampler`), `useMaskSampler` hook, mask-aware spawn/init/update functions in `utils/particles.ts`, and integration into `ParticleEffect` component. Three mask behaviors: "spawn" (spawn-only), "constrain" (kill-on-exit), "both" (spawn + constrain).
