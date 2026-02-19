---
Name: Chunk 9a — Glowing Particle Mode
Type: Feature
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief

Add a new `"glow"` particle mode to the existing particle effect system. Glow particles render as luminous, shader-generated orbs with configurable visual sub-styles (`soft`, `bloom`, `pulse`, `all`) and movement behavior (`stationary` or `drift`). The glow is entirely shader-based (no texture support for this mode). Pulse animation is handled CPU-side by modulating `size` and `alpha` per-frame in `useFrame`, consistent with how twinkle already modulates alpha. The feature integrates with the existing mask system and works in both standalone (`ParticleEffect`) and layer-pinned (`PinnedParticleEffect`) contexts.

# Plan & Instruction

## Step 1: Add Glow Fields to Types

**File:** `packages/interactive-map/src/types/index.ts`

### 1a. Update `ParticleEffectConfig` mode union (line 318)

Change:
```ts
mode?: "twinkle" | "drift";
```
To:
```ts
mode?: "twinkle" | "drift" | "glow";
```

### 1b. Add glow-specific fields to `ParticleEffectConfig`

Insert these fields after `driftDistance` (line 368) and before `zIndex` (line 369):

```ts
  // --- Glow mode options ---
  /**
   * Glow visual sub-style (only used when mode is "glow"):
   * - 'soft': smooth radial gradient fading from center (firefly look).
   * - 'bloom': bright over-exposed core with a wide dim halo (magical orb look).
   * - 'pulse': glow that breathes in size and intensity over time.
   * - 'all': combines bloom visuals with pulse animation (default).
   */
  glowStyle?: "soft" | "bloom" | "pulse" | "all";
  /**
   * Glow movement behaviour (only used when mode is "glow"):
   * - 'stationary': particle glows in place, respawns at a new random position when its cycle ends.
   * - 'drift': particle slowly floats in a direction while glowing (reuses driftDirection/driftSpeed/driftDistance).
   * Default: 'stationary'
   */
  glowMovement?: "stationary" | "drift";
  /**
   * Duration of one glow cycle in seconds.
   * For 'pulse'/'all' styles this is the pulse period.
   * For 'soft'/'bloom' with stationary movement this is how long before respawn.
   * Default: 3
   */
  glowDuration?: number;
  /** Random duration variance factor (0-1). Default: 0.4 */
  glowDurationVariance?: number;
```

### 1c. Update `PinnedParticleEffectConfig` mode union (line 569)

Change:
```ts
mode?: "twinkle" | "drift";
```
To:
```ts
mode?: "twinkle" | "drift" | "glow";
```

### 1d. Add glow-specific fields to `PinnedParticleEffectConfig`

Insert these fields after `driftDistance` (line 593) and before `opacity` (line 594):

```ts
  /** Glow visual sub-style. Default: "all" */
  glowStyle?: "soft" | "bloom" | "pulse" | "all";
  /** Glow movement behaviour. Default: "stationary" */
  glowMovement?: "stationary" | "drift";
  /** Glow cycle duration in seconds. Default: 3 */
  glowDuration?: number;
  /** Glow duration variance (0-1). Default: 0.4 */
  glowDurationVariance?: number;
```

## Step 2: Add Glow Fragment Shaders

**File:** `packages/interactive-map/src/utils/particleShaders.ts`

Append three new exported shader constants after `PARTICLE_FRAGMENT_SHADER_TEXTURE` (after line 36):

### 2a. Soft glow shader

```ts
/**
 * Soft glow: smooth radial gradient from center (firefly effect).
 * Uses a squared smoothstep falloff for a natural, gentle luminance.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_SOFT = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
  intensity = pow(intensity, 2.0);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;
```

### 2b. Bloom glow shader

```ts
/**
 * Bloom glow: bright core with wide halo (magical orb / HDR bloom effect).
 * Renders a sharp bright centre and a softer, wider halo that bleeds outward.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.3, dist);
  core = pow(core, 3.0);
  float halo = 1.0 - smoothstep(0.0, 1.2, dist);
  halo = pow(halo, 1.5) * 0.6;
  float intensity = max(core, halo);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;
```

### 2c. Pulse glow shader

```ts
/**
 * Pulse glow: softer falloff suited for size/alpha breathing animation.
 * The actual pulse animation is driven CPU-side via size and alpha modulation.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_PULSE = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
  intensity = pow(intensity, 2.5);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;
```

## Step 3: Add Glow Particle Utility Functions

**File:** `packages/interactive-map/src/utils/particles.ts`

### 3a. Update `createParticle` for glow defaults (line 109)

Change:
```ts
const baseSize = config.size ?? 3;
```
To:
```ts
const baseSize = config.mode === "glow" ? (config.size ?? 8) : (config.size ?? 3);
```

This gives glow particles a larger default size (8px vs 3px) to accommodate the visible halo.

### 3b. Update `createParticle` for glow cycle duration

After line 118 (the `cycleDuration` calculation), add a block that overrides `cycleDuration` when mode is `"glow"`:

```ts
  // Override cycle duration for glow mode
  if (config.mode === "glow") {
    const glowDuration = config.glowDuration ?? 3;
    const glowVariance = config.glowDurationVariance ?? 0.4;
    cycleDuration = Math.max(
      0.1,
      glowDuration * (1 + randomInRange(-glowVariance, glowVariance))
    );
  }
```

**Note:** This requires changing `cycleDuration` from `const` to `let` on line 115.

### 3c. Update `initializeParticles` for glow mode (after line 159)

Add a glow mode branch inside the initialization loop, after the twinkle branch (`continue` on line 159) and before the drift branch (line 162):

```ts
    if (mode === "glow") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      const glowStyle = config.glowStyle ?? "all";

      if (glowStyle === "pulse" || glowStyle === "all") {
        const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        particle.alpha = 0.3 + pulseFactor * 0.7;
      } else {
        particle.alpha = 1.0;
      }

      // Pre-advance drift position if using drift movement
      if (config.glowMovement === "drift") {
        particle.distanceTraveled = particle.phase * particle.maxDistance;
        particle.x = wrapCoordinate(
          particle.x + particle.dx * particle.distanceTraveled,
          regionWidth
        );
        particle.y = wrapCoordinate(
          particle.y + particle.dy * particle.distanceTraveled,
          regionHeight
        );
      }
      continue;
    }
```

### 3d. Update `initializeMaskedParticles` for glow mode (after line 226)

Add the same glow initialization block after the twinkle branch, identical to step 3c above.

### 3e. Add `updateGlowParticle` function

Append after `updateMaskedDriftParticle` (after line 386):

```ts
export function updateGlowParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number
): void {
  particle.elapsed += delta;

  const glowMovement = config.glowMovement ?? "stationary";

  // Handle drift movement
  if (glowMovement === "drift") {
    const distanceDelta = particle.speed * delta;
    particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
    particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
    particle.distanceTraveled += distanceDelta;
  }

  // Compute glow alpha based on style
  const glowStyle = config.glowStyle ?? "all";
  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;

  if (glowStyle === "pulse" || glowStyle === "all") {
    const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    particle.alpha = 0.3 + pulseFactor * 0.7;
  } else {
    // soft / bloom: constant full glow
    particle.alpha = 1.0;
  }

  // Respawn logic
  if (glowMovement === "stationary") {
    const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
    if (completedCycles > 0) {
      particle.elapsed -= completedCycles * particle.cycleDuration;
      particle.x = randomInRange(0, Math.max(regionWidth, 0));
      particle.y = randomInRange(0, Math.max(regionHeight, 0));
    }
  } else if (particle.distanceTraveled >= particle.maxDistance) {
    particle.x = randomInRange(0, Math.max(regionWidth, 0));
    particle.y = randomInRange(0, Math.max(regionHeight, 0));
    particle.distanceTraveled = 0;
    particle.elapsed = 0;
    randomizeDriftMotion(particle, config);
    particle.alpha = glowStyle === "pulse" || glowStyle === "all" ? 0.3 : 1.0;
  }
}
```

**Note:** `randomInRange`, `wrapCoordinate`, and `randomizeDriftMotion` are file-private helpers already in scope.

### 3f. Add `updateMaskedGlowParticle` function

Append after `updateGlowParticle`:

```ts
export function updateMaskedGlowParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  particle.elapsed += delta;

  const glowMovement = config.glowMovement ?? "stationary";

  // Handle drift movement with mask constraint
  if (glowMovement === "drift") {
    const distanceDelta = particle.speed * delta;
    particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
    particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
    particle.distanceTraveled += distanceDelta;

    const outsideMask = !isParticleInMask(particle, regionWidth, regionHeight, sampler, channel, threshold);
    if (outsideMask || particle.distanceTraveled >= particle.maxDistance) {
      const next = createMaskedParticle(config, regionWidth, regionHeight, sampler, channel, threshold);
      particle.x = next.x;
      particle.y = next.y;
      particle.distanceTraveled = 0;
      particle.elapsed = 0;
      particle.dx = next.dx;
      particle.dy = next.dy;
      particle.speed = next.speed;
    }
  }

  // Compute glow alpha
  const glowStyle = config.glowStyle ?? "all";
  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;

  if (glowStyle === "pulse" || glowStyle === "all") {
    const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    particle.alpha = 0.3 + pulseFactor * 0.7;
  } else {
    particle.alpha = 1.0;
  }

  // Stationary respawn within mask
  if (glowMovement === "stationary") {
    const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
    if (completedCycles > 0) {
      particle.elapsed -= completedCycles * particle.cycleDuration;
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        particle.x = randomInRange(0, Math.max(regionWidth, 0));
        particle.y = randomInRange(0, Math.max(regionHeight, 0));
        if (sampleMaskAtParticle(particle.x, particle.y, regionWidth, regionHeight, sampler, channel) >= threshold) {
          break;
        }
      }
    }
  }
}
```

## Step 4: Integrate Glow into `ParticleEffect` Component

**File:** `packages/interactive-map/src/components/ParticleEffect.tsx`

### 4a. Add shader imports

Update the imports from `particleShaders.ts` to include the three new glow shaders:

```ts
import {
  PARTICLE_FRAGMENT_SHADER_CIRCLE,
  PARTICLE_FRAGMENT_SHADER_TEXTURE,
  PARTICLE_FRAGMENT_SHADER_GLOW_SOFT,
  PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM,
  PARTICLE_FRAGMENT_SHADER_GLOW_PULSE,
  PARTICLE_VERTEX_SHADER,
} from "../utils/particleShaders";
```

### 4b. Add utility function imports

Add to the imports from `../utils/particles`:

```ts
import {
  // ... existing imports ...
  updateGlowParticle,
  updateMaskedGlowParticle,
} from "../utils/particles";
```

### 4c. Add fragment shader selection helper

Add a helper function inside the file (before the component function):

```ts
function selectGlowFragmentShader(glowStyle: string): string {
  switch (glowStyle) {
    case "soft":
      return PARTICLE_FRAGMENT_SHADER_GLOW_SOFT;
    case "bloom":
      return PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM;
    case "pulse":
      return PARTICLE_FRAGMENT_SHADER_GLOW_PULSE;
    case "all":
    default:
      return PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM;
  }
}
```

### 4d. Update fragment shader selection in JSX (line 401)

Change:
```tsx
fragmentShader={texture ? PARTICLE_FRAGMENT_SHADER_TEXTURE : PARTICLE_FRAGMENT_SHADER_CIRCLE}
```
To:
```tsx
fragmentShader={
  config.mode === "glow"
    ? selectGlowFragmentShader(config.glowStyle ?? "all")
    : texture
      ? PARTICLE_FRAGMENT_SHADER_TEXTURE
      : PARTICLE_FRAGMENT_SHADER_CIRCLE
}
```

### 4e. Add glow mode to the `useFrame` update loop (line 295-324)

Replace the current mode branching block:

```ts
if (mode === "drift") {
  // ... existing drift logic ...
} else {
  // ... existing twinkle logic ...
}
```

With:

```ts
if (mode === "drift") {
  if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
    updateMaskedDriftParticle(particle, cappedDelta, config, region.width, region.height, maskSampler, maskChannel, maskThreshold);
  } else {
    updateDriftParticle(particle, cappedDelta, config, region.width, region.height);
  }
} else if (mode === "glow") {
  if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
    updateMaskedGlowParticle(particle, cappedDelta, config, region.width, region.height, maskSampler, maskChannel, maskThreshold);
  } else {
    updateGlowParticle(particle, cappedDelta, config, region.width, region.height);
  }
} else {
  if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
    updateMaskedTwinkleParticle(particle, cappedDelta, region.width, region.height, maskSampler, maskChannel, maskThreshold);
  } else {
    updateTwinkleParticle(particle, cappedDelta, region.width, region.height);
  }
}
```

### 4f. Add pulse size modulation (line 337)

Change:
```ts
sizeArray[index] = particle.size;
```
To:
```ts
let finalSize = particle.size;
if (mode === "glow" && (config.glowStyle === "pulse" || config.glowStyle === "all")) {
  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
  finalSize = particle.size * (1.0 + pulseFactor * 0.5);
}
sizeArray[index] = finalSize;
```

This makes pulse/all particles breathe between 1.0x and 1.5x their base size.

## Step 5: Integrate Glow into `PinnedParticleEffect` Component

**File:** `packages/interactive-map/src/components/PinnedParticleEffect.tsx`

Apply the same changes as Step 4:

1. **Import glow shaders** (same as 4a)
2. **Import `updateGlowParticle` and `updateMaskedGlowParticle`** (same as 4b)
3. **Add `selectGlowFragmentShader` helper** (same as 4c)
4. **Update fragment shader selection in JSX** (same as 4d)
5. **Add glow mode branch to useFrame update loop** (same as 4e)
6. **Add pulse size modulation** (same as 4f)

The PinnedParticleEffect constructs a `ParticleEffectConfig` from `PinnedParticleEffectConfig` — ensure that conversion copies the four new glow fields (`glowStyle`, `glowMovement`, `glowDuration`, `glowDurationVariance`).

## Step 6: Update Mask Effect Resolver

**File:** `packages/interactive-map/src/utils/maskEffectResolver.ts`

No changes required. The resolver uses `Omit<ParticleEffectConfig, ...>` via `MaskChannelParticleEffect`, which automatically inherits the new glow fields. The resolver already passes through all config fields when constructing `ParticleEffectConfig` and `PinnedParticleEffectConfig` instances.

**Verify:** Read the resolver to confirm that `config` spread is used (not field-by-field copy). If it uses explicit field mapping, add the four new glow fields.

## Step 7: Update Demo

**File:** `apps/demo/src/app/page.tsx`

Add three glow particle effects to the existing `particleEffects` array to demonstrate all sub-styles:

```tsx
{
  id: "fireflies",
  mode: "glow",
  glowStyle: "soft",
  glowMovement: "stationary",
  maxCount: 30,
  color: "#FFEB3B",
  size: 6,
  sizeVariance: 0.3,
  glowDuration: 3,
  glowDurationVariance: 0.5,
  region: { x: 200, y: 200, width: 600, height: 400 },
  zIndex: 11,
  opacity: 0.8,
},
{
  id: "magic-orbs",
  mode: "glow",
  glowStyle: "bloom",
  glowMovement: "drift",
  maxCount: 15,
  color: "#9C27B0",
  size: 10,
  sizeVariance: 0.4,
  glowDuration: 4,
  glowDurationVariance: 0.3,
  driftDirection: { x: 0, y: -1 },
  driftDirectionVariance: 25,
  driftSpeed: 15,
  driftSpeedVariance: 0.3,
  driftDistance: 150,
  region: { x: 1200, y: 600, width: 800, height: 500 },
  zIndex: 11,
  opacity: 0.9,
},
{
  id: "pulsing-lights",
  mode: "glow",
  glowStyle: "pulse",
  glowMovement: "stationary",
  maxCount: 20,
  color: "#00BCD4",
  size: 8,
  sizeVariance: 0.2,
  glowDuration: 2.5,
  glowDurationVariance: 0.6,
  region: { x: 2000, y: 300, width: 700, height: 600 },
  zIndex: 11,
  opacity: 0.85,
},
```

## Step 8: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

No changes needed. `ParticleEffectConfig` is already exported from the types barrel. The new glow fields are part of the existing interface. The new utility functions (`updateGlowParticle`, `updateMaskedGlowParticle`) are internal — no need to export.

# Acceptance Criteria

1. `ParticleEffectConfig.mode` accepts `"glow"` as a third option alongside `"twinkle"` and `"drift"`.
2. `PinnedParticleEffectConfig.mode` also accepts `"glow"`.
3. `glowStyle` config selects the visual style: `"soft"` (radial gradient), `"bloom"` (bright core + halo), `"pulse"` (breathing size/alpha), `"all"` (bloom visuals + pulse animation).
4. `glowMovement` config selects movement: `"stationary"` (glow in place, respawn on cycle end) or `"drift"` (float while glowing, reuses drift params).
5. Three new fragment shaders render the correct visual per style — no texture loading for glow mode.
6. Pulse/all styles animate both particle size (1.0x to 1.5x) and alpha (0.3 to 1.0) via CPU-side modulation in `useFrame`.
7. Soft/bloom styles render with constant full alpha (no pulsing).
8. Glow particles default to 8px base size (vs 3px for twinkle/drift).
9. Stationary glow particles respawn at a new random position when their cycle completes.
10. Drift glow particles move along the configured direction and respawn when `driftDistance` is exhausted.
11. Mask-aware spawning and constraining works for glow mode (all three `maskBehavior` values).
12. Glow mode works in both standalone `ParticleEffect` and layer-pinned `PinnedParticleEffect`.
13. Glow mode works via `MaskEffectConfig` channel mapping (mask effect resolver passes through glow fields).
14. Initial load staggers glow particles across their cycle (no simultaneous burst).
15. All glow particles use `AdditiveBlending` for luminous appearance (inherited from existing material setup).
16. Demo shows three glow effects: soft fireflies, bloom magic orbs (drifting), and pulsing lights.
17. The app builds without errors (`pnpm build`).

# Log

- **2026-02-20 (Created):** Initial plan for Chunk 9a — Glowing Particle Mode. Adds `"glow"` as a third particle mode with four sub-styles (soft, bloom, pulse, all) and two movement modes (stationary, drift). Three new fragment shaders for radial glow rendering. CPU-side pulse animation via size/alpha modulation. Full mask integration. Changes span types, particle shaders, particle utils, ParticleEffect, PinnedParticleEffect, and demo page.
