---
Name: Chunk 8c — Multi-Channel Mask Effect Mapping
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add a high-level `MaskEffectConfig` API that maps multiple RGB channels of a single mask image to different effects (shaders and/or particles) in one configuration object. This is a convenience layer on top of the low-level `maskSrc`/`maskChannel` support from Chunks 8a and 8b.

Instead of manually creating 3 separate shader effects each pointing to the same mask with different channels, the user provides a single config:

```ts
maskEffects: [{
  id: "terrain-effects",
  src: "/maps/mask.png",
  red: { preset: "waterRipple", presetParams: { uSpeed: 0.8 } },
  green: { type: "particles", config: { mode: "twinkle", maxCount: 60, color: "#66ff66" } },
  blue: { preset: "glow", presetParams: { uIntensity: 0.5 } },
  zIndex: 1.5,
  space: "map",
}]
```

This depends on **Chunk 8a** (shader mask support) and **Chunk 8b** (particle mask support).

# Plan & Instruction

## Step 1: Define `MaskEffectConfig` Types

**File:** `packages/interactive-map/src/types/index.ts`

### 1a. Add channel effect types

Add these types after the `MaskChannel` type (added in Chunk 8a):

```ts
/**
 * Shader effect to apply on a mask channel.
 * Uses the same shader preset / custom shader system as ShaderEffectConfig.
 */
export interface MaskChannelShaderEffect {
  type?: "shader";
  /** Built-in shader preset name */
  preset?: ShaderPresetName;
  /** Preset-specific parameters */
  presetParams?: Record<string, unknown>;
  /** Custom fragment shader (used when preset is not set) */
  fragmentShader?: string;
  /** Custom vertex shader */
  vertexShader?: string;
  /** Additional custom uniforms */
  uniforms?: Record<string, { value: unknown }>;
  /** Optional texture for the shader */
  src?: string;
}

/**
 * Particle effect to apply on a mask channel.
 * Uses the same config shape as ParticleEffectConfig, minus the mask fields
 * (those are automatically set from the parent MaskEffectConfig).
 */
export interface MaskChannelParticleEffect {
  type: "particles";
  config: Omit<ParticleEffectConfig, "id" | "maskSrc" | "maskChannel" | "maskBehavior" | "maskThreshold">;
}

/** A single channel can have a shader effect, particle effect, or nothing */
export type MaskChannelEffect = MaskChannelShaderEffect | MaskChannelParticleEffect;
```

### 1b. Add `MaskEffectConfig` interface

```ts
/**
 * High-level config that maps RGB channels of a mask image to different effects.
 * Each channel (red, green, blue) can have a shader effect, particle effect, or be unused.
 * This is a convenience wrapper — internally it creates ShaderEffectConfig and ParticleEffectConfig
 * instances with the appropriate maskSrc/maskChannel settings.
 */
export interface MaskEffectConfig {
  /** Unique ID for this mask effect group */
  id: string;
  /** URL to the RGB mask image (PNG) */
  src: string;
  /** Effect to apply on the red channel regions */
  red?: MaskChannelEffect;
  /** Effect to apply on the green channel regions */
  green?: MaskChannelEffect;
  /** Effect to apply on the blue channel regions */
  blue?: MaskChannelEffect;
  /**
   * Coordinate space for shader effects within this group.
   * - 'map': world/map space (default). Parallax-aware.
   * - 'viewport': screen-following overlay space.
   */
  space?: "map" | "viewport";
  /** zIndex for depth ordering. Shader effects get this zIndex, particles get zIndex + 0.001. Default: 12 */
  zIndex?: number;
  /** Override parallax factor for all effects in this group */
  parallaxFactor?: number;
  /** Whether the shader materials use transparent blending. Default: true */
  transparent?: boolean;
  /**
   * Particle mask behavior for all particle effects in this group.
   * Default: "both" (spawn + constrain).
   */
  maskBehavior?: "spawn" | "constrain" | "both";
  /** Minimum mask channel value threshold. Default: 0.1 */
  maskThreshold?: number;
}
```

### 1c. Add `maskEffects` to `InteractiveMapProps`

Add to the `InteractiveMapProps` interface:

```ts
  /** Array of mask effect configurations for region-based effects */
  maskEffects?: MaskEffectConfig[];
```

## Step 2: Create Mask Effect Resolver Utility

**File:** `packages/interactive-map/src/utils/maskEffectResolver.ts` (new file)

This utility expands a `MaskEffectConfig` into individual `ShaderEffectConfig` and `ParticleEffectConfig` objects that the existing rendering system can handle.

```ts
import type {
  MaskChannel,
  MaskChannelEffect,
  MaskEffectConfig,
  ParticleEffectConfig,
  ShaderEffectConfig,
} from "../types";

interface ResolvedMaskEffects {
  shaderEffects: ShaderEffectConfig[];
  particleEffects: ParticleEffectConfig[];
}

const CHANNELS: { key: "red" | "green" | "blue"; channel: MaskChannel }[] = [
  { key: "red", channel: "r" },
  { key: "green", channel: "g" },
  { key: "blue", channel: "b" },
];

/**
 * Resolves a MaskEffectConfig into individual ShaderEffectConfig and ParticleEffectConfig objects.
 * Each channel definition becomes either a shader effect or particle effect with the
 * appropriate maskSrc and maskChannel fields set automatically.
 */
export function resolveMaskEffects(config: MaskEffectConfig): ResolvedMaskEffects {
  const shaderEffects: ShaderEffectConfig[] = [];
  const particleEffects: ParticleEffectConfig[] = [];

  for (const { key, channel } of CHANNELS) {
    const channelEffect: MaskChannelEffect | undefined = config[key];
    if (!channelEffect) continue;

    if (channelEffect.type === "particles") {
      const particleConfig: ParticleEffectConfig = {
        ...channelEffect.config,
        id: `${config.id}-${key}-particles`,
        maskSrc: config.src,
        maskChannel: channel,
        maskBehavior: config.maskBehavior ?? "both",
        maskThreshold: config.maskThreshold ?? 0.1,
        zIndex: (config.zIndex ?? 12) + 0.001,
        parallaxFactor: config.parallaxFactor,
      };
      particleEffects.push(particleConfig);
    } else {
      // Shader effect (type is "shader" or undefined)
      const shaderConfig: ShaderEffectConfig = {
        id: `${config.id}-${key}-shader`,
        preset: channelEffect.preset,
        presetParams: channelEffect.presetParams,
        fragmentShader: channelEffect.fragmentShader,
        vertexShader: channelEffect.vertexShader,
        uniforms: channelEffect.uniforms,
        src: channelEffect.src,
        maskSrc: config.src,
        maskChannel: channel,
        space: config.space ?? "map",
        zIndex: config.zIndex ?? 12,
        parallaxFactor: config.parallaxFactor,
        transparent: config.transparent ?? true,
      };
      shaderEffects.push(shaderConfig);
    }
  }

  return { shaderEffects, particleEffects };
}

/**
 * Resolves an array of MaskEffectConfig into merged shader and particle effect arrays.
 */
export function resolveAllMaskEffects(configs: MaskEffectConfig[]): ResolvedMaskEffects {
  const allShaderEffects: ShaderEffectConfig[] = [];
  const allParticleEffects: ParticleEffectConfig[] = [];

  for (const config of configs) {
    const resolved = resolveMaskEffects(config);
    allShaderEffects.push(...resolved.shaderEffects);
    allParticleEffects.push(...resolved.particleEffects);
  }

  return {
    shaderEffects: allShaderEffects,
    particleEffects: allParticleEffects,
  };
}
```

## Step 3: Integrate into `MapScene`

**File:** `packages/interactive-map/src/components/MapScene.tsx`

### 3a. Add imports

```ts
import { resolveAllMaskEffects } from "../utils/maskEffectResolver";
```

### 3b. Resolve mask effects and merge with existing effects

Inside `MapScene`, add a useMemo that expands mask effects and merges them with the user's existing shader/particle arrays:

```ts
const resolvedMaskEffects = useMemo(() => {
  if (!props.maskEffects || props.maskEffects.length === 0) {
    return { shaderEffects: [], particleEffects: [] };
  }
  return resolveAllMaskEffects(props.maskEffects);
}, [props.maskEffects]);

// Merge mask-generated effects with user-provided effects
const allShaderEffects = useMemo(() => [
  ...(props.shaderEffects ?? []),
  ...resolvedMaskEffects.shaderEffects,
], [props.shaderEffects, resolvedMaskEffects.shaderEffects]);

const allParticleEffects = useMemo(() => [
  ...(props.particleEffects ?? []),
  ...resolvedMaskEffects.particleEffects,
], [props.particleEffects, resolvedMaskEffects.particleEffects]);
```

### 3c. Use merged arrays for rendering

Replace references to `props.shaderEffects` with `allShaderEffects` and `props.particleEffects` with `allParticleEffects` in the rendering logic. Find where `ShaderEffect` and `ParticleEffect` components are mapped/rendered and use the merged arrays instead.

**Before:**
```tsx
{props.shaderEffects?.map((config) => (
  <ShaderEffect key={config.id} config={config} ... />
))}
{props.particleEffects?.map((config) => (
  <ParticleEffect key={config.id} config={config} ... />
))}
```

**After:**
```tsx
{allShaderEffects.map((config) => (
  <ShaderEffect key={config.id} config={config} ... />
))}
{allParticleEffects.map((config) => (
  <ParticleEffect key={config.id} config={config} ... />
))}
```

## Step 4: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

### 4a. Export new types

Add to the type exports from `./types`:

```ts
export type {
  // ... existing exports ...
  MaskChannelShaderEffect,
  MaskChannelParticleEffect,
  MaskChannelEffect,
  MaskEffectConfig,
  // ... rest ...
} from "./types";
```

### 4b. Export resolver utility

```ts
export { resolveMaskEffects, resolveAllMaskEffects } from "./utils/maskEffectResolver";
```

## Step 5: Update Demo to Use `maskEffects` API

**File:** `apps/demo/src/app/page.tsx`

Replace the individual masked shader/particle effects from Chunks 8a/8b demo with the new high-level API:

```tsx
<InteractiveMap
  // ... existing props ...
  maskEffects={[
    {
      id: "terrain-effects",
      src: "/maps/demo-mask.png",
      red: {
        preset: "waterRipple",
        presetParams: { uSpeed: 0.8, uAmplitude: 0.015 },
      },
      green: {
        type: "particles",
        config: {
          mode: "twinkle",
          maxCount: 80,
          color: "#66ffff",
          size: 4,
          twinkleDuration: 2.5,
        },
      },
      blue: {
        preset: "glow",
        presetParams: { uIntensity: 0.6, uGlowColor: [0.2, 1.0, 0.3] },
      },
      zIndex: 1.5,
      space: "map",
      maskBehavior: "both",
    },
  ]}
/>
```

## Step 6: Verify Coexistence with Standalone Effects

Ensure that:
1. User-provided `shaderEffects` and `particleEffects` still work alongside `maskEffects`.
2. A standalone shader effect (e.g., vignette overlay) renders independently from mask effects.
3. No ID collisions — mask-generated IDs use the `{maskId}-{channel}-{type}` pattern.
4. Z-ordering works correctly — mask effects slot into the z-stack based on their `zIndex`.

This requires no code changes — it's a verification step during testing.

# Acceptance Criteria

1. `MaskEffectConfig`, `MaskChannelShaderEffect`, `MaskChannelParticleEffect`, and `MaskChannelEffect` types are exported from the package.
2. `InteractiveMapProps` has an optional `maskEffects` array field.
3. `resolveMaskEffects()` correctly expands a `MaskEffectConfig` into individual `ShaderEffectConfig` and `ParticleEffectConfig` objects with `maskSrc`/`maskChannel` auto-set.
4. `resolveAllMaskEffects()` handles an array of mask effect configs and produces merged shader/particle arrays.
5. `MapScene` merges mask-generated effects with user-provided `shaderEffects` and `particleEffects`.
6. Shader channel effects use the existing `ShaderEffect` component with mask support from Chunk 8a.
7. Particle channel effects use the existing `ParticleEffect` component with mask support from Chunk 8b.
8. Generated effect IDs follow the `{maskId}-{channel}-{type}` pattern (e.g., `terrain-effects-red-shader`).
9. Particle effects within a mask group inherit `maskBehavior` and `maskThreshold` from the parent config.
10. Existing standalone `shaderEffects` and `particleEffects` continue to work independently alongside `maskEffects`.
11. Demo showcases a multi-channel mask with different effect types per channel.
12. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 8c — Multi-Channel Mask Effect Mapping. Adds `MaskEffectConfig` high-level API that maps RGB channels to shader/particle effects in a single config object. Implements `resolveMaskEffects()` resolver that expands configs into individual `ShaderEffectConfig` and `ParticleEffectConfig` objects. Integrates into `MapScene` by merging mask-generated effects with user-provided arrays. Depends on Chunks 8a (shader mask) and 8b (particle mask).
