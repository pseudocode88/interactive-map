---
Name: Chunk 7d-3 — Built-in Shader Presets
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add a built-in shader preset library to `InteractiveMap` that provides five ready-to-use visual effects: **water ripple**, **heat haze**, **glow**, **dissolve**, and **chromatic aberration**. Presets are usable by both **layer shaders** (`LayerShaderConfig.preset`) and **standalone shader effects** (`ShaderEffectConfig.preset`). Each preset auto-animates with sensible defaults and exposes configurable parameters via `presetParams`. When a preset is used without a texture, it renders a graceful fallback visual instead of breaking.

The `preset` and `presetParams` fields already exist on both `LayerShaderConfig` and `ShaderEffectConfig` (reserved in chunks 7d-1 and 7d-2). This chunk implements the resolution logic and the preset registry.

# Plan & Instruction

## Step 1: Update Types — Add `ShaderPresetName` Union Type

**File:** `packages/interactive-map/src/types/index.ts`

### 1a. Add the preset name union type

Add this type **before** the `LayerShaderConfig` interface (before line 64):

```ts
/** Available built-in shader preset names */
export type ShaderPresetName =
  | "waterRipple"
  | "heatHaze"
  | "glow"
  | "dissolve"
  | "chromaticAberration";
```

### 1b. Update `LayerShaderConfig.preset` type

Change the `preset` field from `string` to `ShaderPresetName` and update its JSDoc. Also update the comment on `presetParams`.

Replace lines 90–100 (the `preset` and `presetParams` fields) with:

```ts
  /**
   * Built-in shader preset name. When set, the preset's vertex/fragment shaders are used
   * instead of `vertexShader`/`fragmentShader`. If both `preset` and `fragmentShader` are
   * provided, `preset` takes priority.
   */
  preset?: ShaderPresetName;
  /**
   * Preset-specific parameters. Each preset has its own set of configurable params with
   * sensible defaults. Any params not provided use the preset's defaults.
   * See `ShaderPresetName` for available presets and their parameters.
   */
  presetParams?: Record<string, unknown>;
```

### 1c. Update `LayerShaderConfig.fragmentShader` — make it optional when preset is used

Change `fragmentShader` from required to optional. Replace line 78:

```ts
  /** GLSL fragment shader source. Required when `preset` is not set. */
  fragmentShader?: string;
```

### 1d. Update `ShaderEffectConfig.preset` type

Same change for `ShaderEffectConfig`. Replace lines 367–377 (the `preset` and `presetParams` fields) with:

```ts
  /**
   * Built-in shader preset name. When set, the preset's vertex/fragment shaders are used
   * instead of `vertexShader`/`fragmentShader`. If both `preset` and `fragmentShader` are
   * provided, `preset` takes priority.
   */
  preset?: ShaderPresetName;
  /**
   * Preset-specific parameters. Each preset has its own set of configurable params with
   * sensible defaults. Any params not provided use the preset's defaults.
   * See `ShaderPresetName` for available presets and their parameters.
   */
  presetParams?: Record<string, unknown>;
```

### 1e. Update `ShaderEffectConfig.fragmentShader` — make it optional when preset is used

Change `fragmentShader` from required to optional. Replace line 324:

```ts
  /** GLSL fragment shader source. Required when `preset` is not set. */
  fragmentShader?: string;
```

## Step 2: Create Shader Preset Registry

**File:** `packages/interactive-map/src/utils/shaderPresets.ts` (new file)

This file contains:
1. The `ShaderPresetDefinition` interface
2. All 5 preset GLSL shaders (each with `#ifdef HAS_TEXTURE` for texture/no-texture handling)
3. The preset registry map
4. The `resolveShaderPreset()` function

### Full file content:

```ts
import type { ShaderPresetName } from "../types";

/**
 * Internal definition for a built-in shader preset.
 */
interface ShaderPresetDefinition {
  /** GLSL fragment shader source. Uses `#ifdef HAS_TEXTURE` for texture/no-texture variants. */
  fragmentShader: string;
  /** GLSL vertex shader source. If null, the default passthrough vertex shader is used. */
  vertexShader: string | null;
  /** Default parameter values for this preset. */
  defaults: Record<string, unknown>;
  /** Whether this preset is designed primarily for use with a texture. */
  requiresTexture: boolean;
}

/**
 * Result of resolving a shader preset.
 */
export interface ResolvedPreset {
  vertexShader: string | null;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

// ---------------------------------------------------------------------------
// GLSL Preset Shaders
// ---------------------------------------------------------------------------

const WATER_RIPPLE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform vec4 uWaterColor;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;

  // Multi-layer ripple distortion
  float distX = sin(uv.y * uFrequency + t) * uAmplitude;
  distX += sin(uv.y * uFrequency * 0.5 + t * 1.3) * uAmplitude * 0.5;
  float distY = cos(uv.x * uFrequency + t * 0.7) * uAmplitude;
  distY += cos(uv.x * uFrequency * 0.8 + t * 0.9) * uAmplitude * 0.3;

  vec2 distortedUv = uv + vec2(distX, distY);

  #ifdef HAS_TEXTURE
    gl_FragColor = texture2D(uTexture, distortedUv);
  #else
    // Procedural water surface pattern
    float wave1 = sin(uv.x * uFrequency * 2.0 + t) * 0.5 + 0.5;
    float wave2 = cos(uv.y * uFrequency * 1.5 + t * 0.8) * 0.5 + 0.5;
    float wave3 = sin((uv.x + uv.y) * uFrequency + t * 0.6) * 0.5 + 0.5;
    float pattern = (wave1 + wave2 + wave3) / 3.0;
    vec4 color = uWaterColor;
    color.a *= pattern * 0.6 + 0.2;
    gl_FragColor = color;
  #endif
}
`;

const HEAT_HAZE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uSpeed;
uniform float uIntensity;
uniform float uScale;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;

  // Vertical-biased wavy distortion (heat rises)
  float distX = sin(uv.y * uScale + t * 1.1) * uIntensity * 0.4;
  distX += sin(uv.y * uScale * 2.3 + t * 0.7) * uIntensity * 0.2;
  float distY = sin(uv.y * uScale * 1.3 + t * 1.2) * uIntensity;
  distY += cos(uv.x * uScale * 0.8 + t * 0.5) * uIntensity * 0.3;

  vec2 distortedUv = uv + vec2(distX, distY);

  #ifdef HAS_TEXTURE
    gl_FragColor = texture2D(uTexture, distortedUv);
  #else
    // Semi-transparent shimmer overlay
    float haze = sin(uv.y * uScale * 2.0 + t) * 0.5 + 0.5;
    haze *= sin(uv.x * uScale * 1.5 + t * 0.7) * 0.5 + 0.5;
    float shimmer = sin(uv.y * uScale * 4.0 + t * 2.0) * 0.3 + 0.7;
    gl_FragColor = vec4(1.0, 1.0, 1.0, haze * shimmer * uIntensity * 1.5);
  #endif
}
`;

const GLOW_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uIntensity;
uniform vec3 uGlowColor;
uniform float uRadius;
uniform float uPulseSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float pulse = 0.8 + 0.2 * sin(uTime * uPulseSpeed);

  #ifdef HAS_TEXTURE
    vec4 texColor = texture2D(uTexture, uv);
    // Brightness-based glow
    float brightness = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    float glowMask = smoothstep(1.0 - uRadius, 1.0, brightness);
    float glow = glowMask * uIntensity * pulse;
    vec3 glowContrib = uGlowColor * glow;
    gl_FragColor = vec4(texColor.rgb + glowContrib, texColor.a);
  #else
    // Radial glow from center
    vec2 center = uv - 0.5;
    float dist = length(center);
    float glow = (1.0 - smoothstep(0.0, uRadius, dist)) * uIntensity * pulse;
    gl_FragColor = vec4(uGlowColor * glow, glow);
  #endif
}
`;

const DISSOLVE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uProgress;
uniform float uEdgeWidth;
uniform vec3 uEdgeColor;
uniform float uNoiseScale;
uniform float uSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

// Simple hash-based pseudo-random
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Value noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUv;

  // Auto-animate progress when speed > 0, otherwise use static uProgress
  float progress = uProgress;
  if (uSpeed > 0.0) {
    progress = fract(uTime * uSpeed * 0.1);
  }

  float n = noise(uv * uNoiseScale);
  float dissolve = step(n, progress);
  float edge = smoothstep(progress - uEdgeWidth, progress, n) * (1.0 - dissolve);

  #ifdef HAS_TEXTURE
    vec4 texColor = texture2D(uTexture, uv);
    vec3 finalColor = mix(texColor.rgb, uEdgeColor, edge);
    float alpha = texColor.a * (1.0 - dissolve);
    // Keep edge visible even where texture is dissolved
    alpha = max(alpha, edge * 0.8);
    gl_FragColor = vec4(finalColor, alpha);
  #else
    // Procedural dissolving surface
    float surface = 0.6 + 0.4 * noise(uv * uNoiseScale * 0.5);
    vec3 baseColor = vec3(surface * 0.5);
    vec3 finalColor = mix(baseColor, uEdgeColor, edge);
    float alpha = (1.0 - dissolve) * 0.8;
    alpha = max(alpha, edge * 0.8);
    gl_FragColor = vec4(finalColor, alpha);
  #endif
}
`;

const CHROMATIC_ABERRATION_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uOffset;
uniform float uAngle;
uniform float uSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;

  float angle = uAngle + (uSpeed > 0.0 ? uTime * uSpeed : 0.0);
  vec2 dir = vec2(cos(angle), sin(angle)) * uOffset;

  #ifdef HAS_TEXTURE
    float r = texture2D(uTexture, uv + dir).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - dir).b;
    float a = texture2D(uTexture, uv).a;
    gl_FragColor = vec4(r, g, b, a);
  #else
    // Rainbow fringe ring pattern
    vec2 center = uv - 0.5;
    float dist = length(center);
    float ring = smoothstep(0.25, 0.35, dist) * (1.0 - smoothstep(0.35, 0.5, dist));
    float anim = uSpeed > 0.0 ? sin(uTime * uSpeed) * 0.5 + 0.5 : 0.5;
    float r = ring * smoothstep(0.3 - uOffset * (1.0 + anim), 0.35, dist);
    float g = ring;
    float b = ring * (1.0 - smoothstep(0.35, 0.4 + uOffset * (1.0 + anim), dist));
    float a = max(max(r, g), b) * 0.6;
    gl_FragColor = vec4(r * 0.9, g * 0.7, b * 1.0, a);
  #endif
}
`;

// ---------------------------------------------------------------------------
// Preset Registry
// ---------------------------------------------------------------------------

const PRESET_REGISTRY: Record<ShaderPresetName, ShaderPresetDefinition> = {
  waterRipple: {
    fragmentShader: WATER_RIPPLE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uSpeed: 1.0,
      uAmplitude: 0.02,
      uFrequency: 10.0,
      uWaterColor: [0.1, 0.3, 0.5, 0.3],
    },
    requiresTexture: false,
  },
  heatHaze: {
    fragmentShader: HEAT_HAZE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uSpeed: 0.5,
      uIntensity: 0.01,
      uScale: 8.0,
    },
    requiresTexture: false,
  },
  glow: {
    fragmentShader: GLOW_FRAGMENT,
    vertexShader: null,
    defaults: {
      uIntensity: 0.8,
      uGlowColor: [1.0, 0.9, 0.6],
      uRadius: 0.3,
      uPulseSpeed: 1.0,
    },
    requiresTexture: false,
  },
  dissolve: {
    fragmentShader: DISSOLVE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uProgress: 0.5,
      uEdgeWidth: 0.05,
      uEdgeColor: [1.0, 0.5, 0.0],
      uNoiseScale: 4.0,
      uSpeed: 0.0,
    },
    requiresTexture: false,
  },
  chromaticAberration: {
    fragmentShader: CHROMATIC_ABERRATION_FRAGMENT,
    vertexShader: null,
    defaults: {
      uOffset: 0.005,
      uAngle: 0.0,
      uSpeed: 0.5,
    },
    requiresTexture: true,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves a shader preset by name into concrete vertex/fragment shaders and uniforms.
 *
 * - Looks up the preset in the built-in registry.
 * - Merges `presetParams` over the preset's defaults to produce uniform values.
 * - Prepends `#define HAS_TEXTURE` to the fragment shader when `hasTexture` is true.
 * - Returns `null` if the preset name is not found.
 *
 * @param presetName - The preset name to resolve.
 * @param presetParams - Optional user overrides for preset parameters.
 *   Keys should match the preset's uniform names (e.g., `uSpeed`, `uAmplitude`).
 *   Values that are not provided use the preset's defaults.
 * @param hasTexture - Whether a texture is available (layer shaders: always true;
 *   standalone: true only when `src` is provided).
 */
export function resolveShaderPreset(
  presetName: string,
  presetParams?: Record<string, unknown>,
  hasTexture?: boolean
): ResolvedPreset | null {
  const definition = PRESET_REGISTRY[presetName as ShaderPresetName];
  if (!definition) {
    return null;
  }

  // Merge defaults with user overrides (user wins)
  const mergedParams = { ...definition.defaults, ...presetParams };

  // Convert params to Three.js uniform format
  const uniforms: Record<string, { value: unknown }> = {};
  for (const [key, value] of Object.entries(mergedParams)) {
    uniforms[key] = { value };
  }

  // Prepend HAS_TEXTURE define when texture is available
  let fragmentShader = definition.fragmentShader;
  if (hasTexture) {
    fragmentShader = "#define HAS_TEXTURE\n" + fragmentShader;
  }

  return {
    vertexShader: definition.vertexShader,
    fragmentShader,
    uniforms,
  };
}
```

### Key design decisions:

1. **`#define HAS_TEXTURE` approach**: Each preset shader uses `#ifdef HAS_TEXTURE` / `#else` blocks. The `resolveShaderPreset` function prepends `#define HAS_TEXTURE` when a texture is available. This keeps a single shader source per preset while supporting both modes.

2. **Param naming convention**: Preset params use the `u` prefix (e.g., `uSpeed`, `uAmplitude`) — the same names as the GLSL uniforms. Users pass them as-is in `presetParams`:
   ```ts
   presetParams: { uSpeed: 2.0, uAmplitude: 0.05 }
   ```

3. **No user-extensible registry**: The registry is internal. Users who need custom effects use `fragmentShader` directly.

4. **Fallback visuals**: Every preset has a `#else` branch that renders a meaningful visual without a texture (procedural water pattern, shimmer overlay, radial glow, dissolving noise, rainbow fringe).

## Step 3: Integrate Presets into `MapLayerMesh`

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

### 3a. Add import

Add to existing imports:

```ts
import { resolveShaderPreset } from "../utils/shaderPresets";
```

### 3b. Resolve preset in uniform builder

Modify the `shaderUniforms` useMemo (currently at lines 111–122). When `shaderConfig.preset` is set, resolve the preset and merge its uniforms with the auto-injected ones.

Replace the existing `shaderUniforms` useMemo with:

```ts
const resolvedPreset = useMemo(() => {
  if (!shaderConfig?.preset) return null;
  return resolveShaderPreset(shaderConfig.preset, shaderConfig.presetParams, true);
}, [shaderConfig?.preset, shaderConfig?.presetParams]);

const shaderUniforms = useMemo(() => {
  if (!shaderConfig) return null;
  // When using a preset, we must have either a preset or a fragmentShader
  if (!shaderConfig.preset && !shaderConfig.fragmentShader) return null;

  const autoUniforms = buildLayerShaderUniforms(
    processedTexture,
    textureWidth,
    textureHeight
  );

  // Merge order: auto-injected < preset < custom (each layer wins over the previous)
  const presetUniforms = resolvedPreset?.uniforms ?? {};
  const customUniforms = shaderConfig.uniforms ?? {};

  return { ...autoUniforms, ...presetUniforms, ...customUniforms };
}, [processedTexture, shaderConfig, resolvedPreset, textureHeight, textureWidth]);
```

Replace the existing `cloneShaderUniforms` useMemo with the same pattern (separate object):

```ts
const cloneShaderUniforms = useMemo(() => {
  if (!shaderConfig) return null;
  if (!shaderConfig.preset && !shaderConfig.fragmentShader) return null;

  const autoUniforms = buildLayerShaderUniforms(
    processedTexture,
    textureWidth,
    textureHeight
  );

  const presetUniforms = resolvedPreset?.uniforms ?? {};
  const customUniforms = shaderConfig.uniforms ?? {};

  return { ...autoUniforms, ...presetUniforms, ...customUniforms };
}, [processedTexture, shaderConfig, resolvedPreset, textureHeight, textureWidth]);
```

### 3c. Compute effective shaders

Add two computed values after the `resolvedPreset` useMemo:

```ts
const effectiveVertexShader = resolvedPreset?.vertexShader
  ?? shaderConfig?.vertexShader
  ?? DEFAULT_LAYER_VERTEX_SHADER;

const effectiveFragmentShader = resolvedPreset?.fragmentShader
  ?? shaderConfig?.fragmentShader
  ?? "";
```

### 3d. Update JSX to use effective shaders

In the main mesh `<shaderMaterial>` JSX (around line 276–283), replace:
- `shaderConfig.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER` → `effectiveVertexShader`
- `shaderConfig.fragmentShader` → `effectiveFragmentShader`

```tsx
{shaderConfig && shaderUniforms ? (
  <shaderMaterial
    ref={shaderMaterialRef}
    vertexShader={effectiveVertexShader}
    fragmentShader={effectiveFragmentShader}
    uniforms={shaderUniforms}
    transparent={shaderConfig.transparent ?? true}
    depthWrite={shaderConfig.depthWrite ?? false}
  />
) : (
  <meshBasicMaterial map={processedTexture} transparent />
)}
```

Do the same for the carousel clone mesh (around line 291–299):

```tsx
{shaderConfig && cloneShaderUniforms ? (
  <shaderMaterial
    ref={cloneShaderMaterialRef}
    vertexShader={effectiveVertexShader}
    fragmentShader={effectiveFragmentShader}
    uniforms={cloneShaderUniforms}
    transparent={shaderConfig.transparent ?? true}
    depthWrite={shaderConfig.depthWrite ?? false}
  />
) : (
  <meshBasicMaterial map={processedTexture} transparent />
)}
```

## Step 4: Integrate Presets into `ShaderEffect`

**File:** `packages/interactive-map/src/components/ShaderEffect.tsx`

### 4a. Add import

```ts
import { resolveShaderPreset } from "../utils/shaderPresets";
```

### 4b. Resolve preset in `ShaderEffectInner`

Inside `ShaderEffectInner`, add preset resolution **before** the `shaderUniforms` useMemo:

```ts
const resolvedPreset = useMemo(() => {
  if (!config.preset) return null;
  return resolveShaderPreset(config.preset, config.presetParams, !!texture);
}, [config.preset, config.presetParams, texture]);

const effectiveVertexShader = resolvedPreset?.vertexShader
  ?? config.vertexShader
  ?? DEFAULT_LAYER_VERTEX_SHADER;

const effectiveFragmentShader = resolvedPreset?.fragmentShader
  ?? config.fragmentShader
  ?? "";
```

### 4c. Update uniform builder

Replace the existing `shaderUniforms` useMemo (line 88–91) with:

```ts
const shaderUniforms = useMemo(() => {
  const autoUniforms = buildStandaloneShaderUniforms(quadWidth, quadHeight, texture);

  // Merge order: auto-injected < preset < custom
  const presetUniforms = resolvedPreset?.uniforms ?? {};
  const customUniforms = config.uniforms ?? {};

  return { ...autoUniforms, ...presetUniforms, ...customUniforms };
}, [quadWidth, quadHeight, texture, resolvedPreset, config.uniforms]);
```

### 4d. Update JSX to use effective shaders and fix hooks ordering

In the `<shaderMaterial>` JSX (line 151–158), replace:
- `config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER` → `effectiveVertexShader`
- `config.fragmentShader` → `effectiveFragmentShader`

```tsx
<shaderMaterial
  ref={shaderMaterialRef}
  vertexShader={effectiveVertexShader}
  fragmentShader={effectiveFragmentShader}
  uniforms={shaderUniforms}
  transparent={config.transparent ?? true}
  depthWrite={config.depthWrite ?? false}
/>
```

**IMPORTANT — Hooks ordering:** The no-shader early return guard (`if (!config.preset && !config.fragmentShader) return null`) must be placed **after** the `useFrame` hook, not before it. React hooks must be called in the same order on every render. Placing a `return` between `useMemo` and `useFrame` means `useFrame` is skipped on some renders, violating the rules of hooks.

The correct ordering inside `ShaderEffectInner` must be:

1. All `useRef` calls
2. All `useMemo` calls (resolvedPreset, effectiveShaders, shaderUniforms)
3. `useFrame` call — guard internally with `if (!meshRef.current || !hasShader) return;`
4. Early return for no-shader case: `if (!hasShader) return null;`
5. JSX return

```tsx
// Compute this before useFrame
const hasShader = !!config.preset || !!config.fragmentShader;

useFrame((_, delta) => {
  if (!meshRef.current || !hasShader) {
    return;
  }
  // ... rest of existing useFrame logic unchanged
});

// Early return AFTER all hooks
if (!hasShader) {
  return null;
}

return (
  <mesh ref={meshRef} ...>
    ...
  </mesh>
);
```

### 4e. Update the outer `ShaderEffect` wrapper

The outer component currently checks `props.config.src` to decide texture loading. When using a preset, the user might also provide `src` for a textured preset. No changes needed here — the existing logic already handles this correctly:
- If `config.src` is set → loads texture → `ShaderEffectInner` receives `texture`
- If `config.src` is not set → `ShaderEffectInner` receives `texture=null`
- The `resolveShaderPreset` call inside `ShaderEffectInner` receives the correct `hasTexture` boolean.

## Step 5: Update `buildLayerShaderUniforms` Signature

**File:** `packages/interactive-map/src/utils/shaderDefaults.ts`

The `buildLayerShaderUniforms` function currently accepts `customUniforms` as its 4th parameter. In Step 3, we now handle merging separately (auto < preset < custom). To avoid double-merging, we need to call `buildLayerShaderUniforms` **without** `customUniforms` when using presets.

No signature change is needed — the `customUniforms` parameter is already optional. In Step 3b we simply pass no `customUniforms` argument (omit it), letting the auto-injected uniforms be the base, then merge preset and custom on top externally.

Similarly for `buildStandaloneShaderUniforms` in Step 4c.

**No file changes needed in this step** — this is a note clarifying why Steps 3b and 4c omit the `customUniforms` parameter.

## Step 6: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

### 6a. Add `ShaderPresetName` to type exports

Add `ShaderPresetName` to the type export block (alphabetically):

```ts
export type {
  BounceAnimation,
  CarouselAnimation,
  EasingConfig,
  EasingPreset,
  FadeAnimation,
  FogEffectConfig,
  FogOpacityPulse,
  FogScaleBreathing,
  InteractiveMapProps,
  LayerAnimation,
  LayerShaderConfig,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  ParallaxConfig,
  PanConfig,
  ShaderEffectConfig,
  ShaderPresetName,
  SpriteEffectConfig,
  WobbleAnimation,
  ZoomConfig,
} from "./types";
```

### 6b. Export `resolveShaderPreset` for advanced users

Add a new export line for the preset resolver utility:

```ts
export { resolveShaderPreset } from "./utils/shaderPresets";
```

Also export the `ResolvedPreset` type:

```ts
export type { ResolvedPreset } from "./utils/shaderPresets";
```

The full updated `index.ts`:

```ts
export { InteractiveMap } from "./components/InteractiveMap";
export {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildStandaloneShaderUniforms,
} from "./utils/shaderDefaults";
export { resolveShaderPreset } from "./utils/shaderPresets";
export type { ResolvedPreset } from "./utils/shaderPresets";
export type {
  BounceAnimation,
  CarouselAnimation,
  EasingConfig,
  EasingPreset,
  FadeAnimation,
  FogEffectConfig,
  FogOpacityPulse,
  FogScaleBreathing,
  InteractiveMapProps,
  LayerAnimation,
  LayerShaderConfig,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  ParallaxConfig,
  PanConfig,
  ShaderEffectConfig,
  ShaderPresetName,
  SpriteEffectConfig,
  WobbleAnimation,
  ZoomConfig,
} from "./types";
```

## Step 7: Update Demo App

**File:** `apps/demo/src/app/page.tsx` (or wherever the demo config lives)

Add a standalone shader effect using a preset to demonstrate the feature. Add to the existing `shaderEffects` array (or create one if the demo doesn't have it yet):

```tsx
shaderEffects={[
  // ... any existing shader effects ...
  {
    id: "water-overlay",
    preset: "waterRipple",
    presetParams: { uSpeed: 0.8, uAmplitude: 0.015 },
    zIndex: 13,
    space: "viewport",
  },
]}
```

This renders a viewport-space water ripple overlay (no texture needed) with slightly customized speed and amplitude.

**This step is optional** — only add if there is a suitable place in the demo. If the demo already has shader effects, add this alongside them. If not, skip and verify manually.

## Preset Reference (for documentation / JSDoc)

### `waterRipple`
Animated water surface distortion with multi-layer sine waves.
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `uSpeed` | float | `1.0` | Animation speed multiplier |
| `uAmplitude` | float | `0.02` | Distortion strength (UV offset) |
| `uFrequency` | float | `10.0` | Wave frequency |
| `uWaterColor` | vec4 | `[0.1, 0.3, 0.5, 0.3]` | Color for no-texture fallback |
- **With texture:** Distorts the texture's UV coordinates with ripple waves.
- **Without texture:** Renders a procedural blue-tinted water pattern.

### `heatHaze`
Vertical-biased wavy distortion simulating rising heat.
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `uSpeed` | float | `0.5` | Animation speed multiplier |
| `uIntensity` | float | `0.01` | Distortion strength |
| `uScale` | float | `8.0` | Distortion wave scale |
- **With texture:** Distorts the texture with heat shimmer.
- **Without texture:** Renders a semi-transparent white shimmer overlay.

### `glow`
Bloom/glow effect with optional pulse animation.
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `uIntensity` | float | `0.8` | Glow brightness |
| `uGlowColor` | vec3 | `[1.0, 0.9, 0.6]` | Glow color (warm yellow) |
| `uRadius` | float | `0.3` | Glow radius / brightness threshold |
| `uPulseSpeed` | float | `1.0` | Pulse animation speed (0 to disable) |
- **With texture:** Adds glow to bright areas of the texture.
- **Without texture:** Renders a radial glow from center.

### `dissolve`
Noise-based alpha dissolution with glowing edge.
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `uProgress` | float | `0.5` | Dissolve progress (0 = fully visible, 1 = fully dissolved) |
| `uEdgeWidth` | float | `0.05` | Width of the glowing dissolve edge |
| `uEdgeColor` | vec3 | `[1.0, 0.5, 0.0]` | Edge glow color (orange) |
| `uNoiseScale` | float | `4.0` | Noise pattern scale |
| `uSpeed` | float | `0.0` | Auto-animation speed (0 = static, use `uProgress` manually) |
- **With texture:** Dissolves the texture with a noise pattern and glowing edge.
- **Without texture:** Dissolves a procedural noise surface.
- **Note:** Set `uSpeed > 0` for auto-animated dissolve (loops). Set `uSpeed: 0` and control `uProgress` for manual dissolve.

### `chromaticAberration`
RGB channel offset for a prismatic / glitch effect.
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `uOffset` | float | `0.005` | Channel separation distance (UV space) |
| `uAngle` | float | `0.0` | Direction angle in radians |
| `uSpeed` | float | `0.5` | Auto-rotation speed for angle (0 to disable) |
- **With texture:** Offsets R, G, B channels of the texture.
- **Without texture:** Renders a rainbow fringe ring pattern.

# Acceptance Criteria

1. A new `ShaderPresetName` union type is exported with 5 values: `"waterRipple"`, `"heatHaze"`, `"glow"`, `"dissolve"`, `"chromaticAberration"`.
2. A new `utils/shaderPresets.ts` file contains the preset registry and `resolveShaderPreset()` function.
3. Setting `preset: "waterRipple"` on a `LayerShaderConfig` (layer shader) applies the water ripple effect to that layer using the layer's texture.
4. Setting `preset: "glow"` on a `ShaderEffectConfig` (standalone shader) without `src` renders the no-texture fallback (radial glow).
5. `presetParams` override individual preset defaults. E.g., `{ uSpeed: 2.0 }` doubles the speed while keeping other params at defaults.
6. Custom `uniforms` on the config still take highest precedence (auto-injected < preset < custom).
7. All 5 presets auto-animate via `uTime` with sensible defaults (except dissolve which defaults to `uSpeed: 0` for manual control).
8. All 5 presets render a graceful fallback visual when no texture is available.
9. When `preset` is set, `fragmentShader` and `vertexShader` on the config are ignored (preset takes priority).
10. `fragmentShader` is now optional on both `LayerShaderConfig` and `ShaderEffectConfig` (required only when `preset` is not set).
11. Layer shader presets work correctly with existing features: parallax, carousel clone, opacity animation.
12. Standalone shader presets work correctly with both `map` and `viewport` coordinate spaces.
13. `resolveShaderPreset`, `ResolvedPreset`, and `ShaderPresetName` are exported from the package barrel.
14. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 7d-3 — Built-in Shader Presets. Covers 5 presets (water ripple, heat haze, glow, dissolve, chromatic aberration) with `#define HAS_TEXTURE` approach for dual-mode shaders, preset registry in `utils/shaderPresets.ts`, `resolveShaderPreset()` resolver, integration into both `MapLayerMesh` and `ShaderEffect` components, `ShaderPresetName` union type, and barrel exports. All presets auto-animate via `uTime` with configurable params. Fallback visuals provided for all presets when used without texture.
- **2026-02-19 (Review fix):** Step 4d updated — the no-shader early return in `ShaderEffectInner` must be placed **after** `useFrame`, not before it, to avoid violating React's rules of hooks. Added `hasShader` guard inside `useFrame` and moved the `return null` below all hook calls.
