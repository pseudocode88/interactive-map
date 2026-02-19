---
Name: Chunk 8a — Mask Texture Support for Shader Effects
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add mask texture support to both **layer shaders** (`LayerShaderConfig`) and **standalone shader effects** (`ShaderEffectConfig`). A mask is an RGB PNG image where each color channel (R/G/B) defines an independent region. When a mask is attached to a shader effect, the effect is only visible where the specified channel has a non-zero value — the channel value (0.0–1.0) controls the effect's alpha/intensity.

This enables painting region-specific effects (water ripple on coastlines, glow on forests, heat haze on deserts) using a single mask image with up to 7 region combinations (R, G, B, R+G, R+B, G+B, R+G+B).

# Plan & Instruction

## Step 1: Add Mask-Related Types

**File:** `packages/interactive-map/src/types/index.ts`

### 1a. Add `MaskChannel` type

Add this type before the `LayerShaderConfig` interface (after line 70, below `ShaderPresetName`):

```ts
/** Color channel to sample from a mask texture */
export type MaskChannel = "r" | "g" | "b";
```

### 1b. Add mask fields to `LayerShaderConfig`

Add these fields at the end of the `LayerShaderConfig` interface (before the closing `}`):

```ts
  /**
   * Optional mask texture URL (PNG). When provided, the mask is loaded and injected
   * as `uMaskTexture` (sampler2D). The effect is multiplied by the selected channel's
   * intensity (0.0 = fully masked, 1.0 = fully visible).
   * The mask is sampled at the same UV coordinates as the layer texture.
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to use. Default: "r".
   * - "r": red channel
   * - "g": green channel
   * - "b": blue channel
   */
  maskChannel?: MaskChannel;
```

### 1c. Add mask fields to `ShaderEffectConfig`

Add the same fields at the end of the `ShaderEffectConfig` interface (before the closing `}`):

```ts
  /**
   * Optional mask texture URL (PNG). When provided, the mask is loaded and injected
   * as `uMaskTexture` (sampler2D). The effect is multiplied by the selected channel's
   * intensity (0.0 = fully masked, 1.0 = fully visible).
   * The mask is sampled at `vUv` (0–1 across the shader quad).
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to use. Default: "r".
   * - "r": red channel
   * - "g": green channel
   * - "b": blue channel
   */
  maskChannel?: MaskChannel;
```

## Step 2: Add Mask Uniform Helpers

**File:** `packages/interactive-map/src/utils/shaderDefaults.ts`

### 2a. Add `buildMaskUniforms` helper function

Add this function after the existing `buildStandaloneShaderUniforms` function:

```ts
import type { MaskChannel } from "../types";
import { Texture } from "three";

/**
 * Channel selector vectors for dot-product mask sampling.
 * Using dot(maskColor.rgb, selector) extracts the desired channel without branching.
 */
const MASK_CHANNEL_VECTORS: Record<MaskChannel, [number, number, number]> = {
  r: [1, 0, 0],
  g: [0, 1, 0],
  b: [0, 0, 1],
};

/**
 * Builds mask-related uniforms when a mask texture is provided.
 * Returns an empty object if no mask texture is given.
 *
 * @param maskTexture - The loaded mask texture (or null if not loaded).
 * @param maskChannel - Which channel to sample. Default: "r".
 */
export function buildMaskUniforms(
  maskTexture: Texture | null,
  maskChannel: MaskChannel = "r"
): Record<string, { value: unknown }> {
  if (!maskTexture) return {};

  return {
    uMaskTexture: { value: maskTexture },
    uMaskChannelSelector: { value: MASK_CHANNEL_VECTORS[maskChannel] },
  };
}
```

### 2b. Add `prependMaskDefine` helper function

Add this in the same file:

```ts
/**
 * Prepends `#define HAS_MASK` to a fragment shader source string when a mask is active.
 * This enables `#ifdef HAS_MASK` blocks in shader code.
 *
 * @param fragmentShader - The original fragment shader source.
 * @param hasMask - Whether a mask texture is available.
 */
export function prependMaskDefine(
  fragmentShader: string,
  hasMask: boolean
): string {
  if (!hasMask) return fragmentShader;
  return "#define HAS_MASK\n" + fragmentShader;
}
```

## Step 3: Update Shader Presets to Support Masks

**File:** `packages/interactive-map/src/utils/shaderPresets.ts`

### 3a. Add mask sampling block to each preset

Every preset fragment shader needs a mask sampling block. Add the following uniform declarations and alpha masking logic to **each** of the 5 preset fragment shaders.

**Uniform declarations** — Add after the existing uniform declarations (after `varying vec2 vUv;`) in each preset:

```glsl
#ifdef HAS_MASK
uniform sampler2D uMaskTexture;
uniform vec3 uMaskChannelSelector;
#endif
```

**Alpha masking** — Add just before the final `gl_FragColor` assignment in each preset's `main()` function. This goes right before the closing `}` of `main()`:

```glsl
  #ifdef HAS_MASK
  vec4 maskSample = texture2D(uMaskTexture, vUv);
  float maskValue = dot(maskSample.rgb, uMaskChannelSelector);
  gl_FragColor.a *= maskValue;
  #endif
```

**IMPORTANT:** The mask block must be placed **after** the `#ifdef HAS_TEXTURE` / `#else` / `#endif` block and after `gl_FragColor` is set, but before the closing `}` of `main()`. This ensures the mask multiplies the final alpha regardless of whether a texture is used.

Apply this change to all 5 preset shaders:
1. `WATER_RIPPLE_FRAGMENT`
2. `HEAT_HAZE_FRAGMENT`
3. `GLOW_FRAGMENT`
4. `DISSOLVE_FRAGMENT`
5. `CHROMATIC_ABERRATION_FRAGMENT`

**Example — Full updated `WATER_RIPPLE_FRAGMENT`:**

```glsl
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform vec4 uWaterColor;

#ifdef HAS_MASK
uniform sampler2D uMaskTexture;
uniform vec3 uMaskChannelSelector;
#endif

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;

  float distX = sin(uv.y * uFrequency + t) * uAmplitude;
  distX += sin(uv.y * uFrequency * 0.5 + t * 1.3) * uAmplitude * 0.5;
  float distY = cos(uv.x * uFrequency + t * 0.7) * uAmplitude;
  distY += cos(uv.x * uFrequency * 0.8 + t * 0.9) * uAmplitude * 0.3;

  vec2 distortedUv = uv + vec2(distX, distY);

  #ifdef HAS_TEXTURE
    gl_FragColor = texture2D(uTexture, distortedUv);
  #else
    float wave1 = sin(uv.x * uFrequency * 2.0 + t) * 0.5 + 0.5;
    float wave2 = cos(uv.y * uFrequency * 1.5 + t * 0.8) * 0.5 + 0.5;
    float wave3 = sin((uv.x + uv.y) * uFrequency + t * 0.6) * 0.5 + 0.5;
    float pattern = (wave1 + wave2 + wave3) / 3.0;
    vec4 color = uWaterColor;
    color.a *= pattern * 0.6 + 0.2;
    gl_FragColor = color;
  #endif

  #ifdef HAS_MASK
  vec4 maskSample = texture2D(uMaskTexture, vUv);
  float maskValue = dot(maskSample.rgb, uMaskChannelSelector);
  gl_FragColor.a *= maskValue;
  #endif
}
```

Follow the same pattern for the other 4 presets — add the `#ifdef HAS_MASK` uniform block near the top and the alpha masking block at the end of `main()`.

### 3b. Update `resolveShaderPreset` to accept `hasMask` parameter

Update the function signature and prepend `#define HAS_MASK` when a mask is active:

```ts
/**
 * @param hasMask - Whether a mask texture is available.
 */
export function resolveShaderPreset(
  presetName: string,
  presetParams?: Record<string, unknown>,
  hasTexture?: boolean,
  hasMask?: boolean
): ResolvedPreset | null {
  const definition = PRESET_REGISTRY[presetName as ShaderPresetName];
  if (!definition) {
    return null;
  }

  const mergedParams = { ...definition.defaults, ...presetParams };

  const uniforms: Record<string, { value: unknown }> = {};
  for (const [key, value] of Object.entries(mergedParams)) {
    uniforms[key] = { value };
  }

  let fragmentShader = definition.fragmentShader;
  if (hasTexture) {
    fragmentShader = "#define HAS_TEXTURE\n" + fragmentShader;
  }
  if (hasMask) {
    fragmentShader = "#define HAS_MASK\n" + fragmentShader;
  }

  return {
    vertexShader: definition.vertexShader,
    fragmentShader,
    uniforms,
  };
}
```

## Step 4: Integrate Mask into `MapLayerMesh`

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

### 4a. Add imports

```ts
import { buildMaskUniforms, prependMaskDefine } from "../utils/shaderDefaults";
import { TextureLoader } from "three";
```

(Note: `TextureLoader` may already be imported via `useLoader`. Check existing imports.)

### 4b. Load mask texture conditionally

Add mask texture loading after the existing layer texture loading. Use the same `useLoader` pattern. Since hooks must be called unconditionally, use a placeholder approach:

```ts
// Load mask texture if maskSrc is provided
const maskSrc = layer.shaderConfig?.maskSrc;
const maskChannel = layer.shaderConfig?.maskChannel ?? "r";
const maskTexture = useLoader(
  TextureLoader,
  maskSrc || "/placeholder-1x1.png"
);
const hasMask = !!maskSrc;
const activeMaskTexture = hasMask ? maskTexture : null;
```

**IMPORTANT — Conditional hook workaround:** React hooks cannot be called conditionally. Since `useLoader` is a hook, we must always call it. Use a tiny 1x1 transparent PNG as a placeholder when no mask is needed. Create this file:

**File:** `apps/demo/public/placeholder-1x1.png` — a 1x1 transparent PNG (can be generated or use a data URI approach).

**Alternative approach (preferred):** Use the same wrapper component pattern as `ShaderEffect.tsx`. Split `MapLayerMesh` into an outer component that conditionally renders an inner component when `maskSrc` is present. However, this would be a larger refactor.

**Simplest approach:** Use React Three Fiber's `useLoader` with a suspend boundary, loading the mask only when `maskSrc` is defined. Since `MapLayerMesh` already calls `useLoader` for the layer texture, adding a second conditional load requires the wrapper pattern.

**Recommended approach:** Add a `useMaskTexture` custom hook that handles conditional loading:

**File:** `packages/interactive-map/src/hooks/useMaskTexture.ts` (new file)

```ts
import { useEffect, useState } from "react";
import { TextureLoader, Texture, LinearFilter, SRGBColorSpace } from "three";

/**
 * Loads a mask texture from a URL. Returns null if no src is provided.
 * Uses imperative TextureLoader (not useLoader hook) to allow conditional loading.
 */
export function useMaskTexture(src?: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!src) {
      setTexture(null);
      return;
    }

    const loader = new TextureLoader();
    let cancelled = false;

    loader.load(src, (tex) => {
      if (cancelled) {
        tex.dispose();
        return;
      }
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.needsUpdate = true;
      setTexture(tex);
    });

    return () => {
      cancelled = true;
      setTexture((prev) => {
        if (prev) prev.dispose();
        return null;
      });
    };
  }, [src]);

  return texture;
}
```

### 4c. Use `useMaskTexture` in `MapLayerMesh`

Add to `MapLayerMesh`:

```ts
import { useMaskTexture } from "../hooks/useMaskTexture";

// Inside the component, after existing hooks:
const maskTexture = useMaskTexture(layer.shaderConfig?.maskSrc);
const maskChannel = layer.shaderConfig?.maskChannel ?? "r";
const hasMask = !!maskTexture;
```

### 4d. Update uniform building to include mask uniforms

Update the `shaderUniforms` useMemo to merge mask uniforms:

```ts
const shaderUniforms = useMemo(() => {
  if (!shaderConfig) return null;
  if (!shaderConfig.preset && !shaderConfig.fragmentShader) return null;

  const autoUniforms = buildLayerShaderUniforms(
    processedTexture,
    textureWidth,
    textureHeight
  );

  const presetUniforms = resolvedPreset?.uniforms ?? {};
  const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
  const customUniforms = shaderConfig.uniforms ?? {};

  // Merge order: auto < preset < mask < custom
  return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
}, [processedTexture, shaderConfig, resolvedPreset, maskTexture, maskChannel, textureHeight, textureWidth]);
```

Do the same for `cloneShaderUniforms`.

### 4e. Update `resolveShaderPreset` calls to pass `hasMask`

Update the `resolvedPreset` useMemo:

```ts
const resolvedPreset = useMemo(() => {
  if (!shaderConfig?.preset) return null;
  return resolveShaderPreset(shaderConfig.preset, shaderConfig.presetParams, true, hasMask);
}, [shaderConfig?.preset, shaderConfig?.presetParams, hasMask]);
```

### 4f. Prepend `#define HAS_MASK` for custom (non-preset) shaders

When using a custom `fragmentShader` (not a preset), prepend the mask define:

```ts
const effectiveFragmentShader = resolvedPreset?.fragmentShader
  ?? prependMaskDefine(shaderConfig?.fragmentShader ?? "", hasMask)
```

**Note:** For presets, `resolveShaderPreset` already handles prepending `#define HAS_MASK`. For custom shaders, `prependMaskDefine` handles it. This ensures custom shaders can also use `#ifdef HAS_MASK` blocks.

## Step 5: Integrate Mask into `ShaderEffect`

**File:** `packages/interactive-map/src/components/ShaderEffect.tsx`

### 5a. Add imports

```ts
import { useMaskTexture } from "../hooks/useMaskTexture";
import { buildMaskUniforms, prependMaskDefine } from "../utils/shaderDefaults";
```

### 5b. Load mask texture in `ShaderEffectInner`

Inside `ShaderEffectInner`, add after existing hooks:

```ts
const maskTexture = useMaskTexture(config.maskSrc);
const maskChannel = config.maskChannel ?? "r";
const hasMask = !!maskTexture;
```

### 5c. Update preset resolution to pass `hasMask`

```ts
const resolvedPreset = useMemo(() => {
  if (!config.preset) return null;
  return resolveShaderPreset(config.preset, config.presetParams, !!texture, hasMask);
}, [config.preset, config.presetParams, texture, hasMask]);
```

### 5d. Update effective fragment shader for custom shaders

```ts
const effectiveFragmentShader = resolvedPreset?.fragmentShader
  ?? prependMaskDefine(config.fragmentShader ?? "", hasMask)
```

### 5e. Update uniform merging to include mask uniforms

```ts
const shaderUniforms = useMemo(() => {
  const autoUniforms = buildStandaloneShaderUniforms(quadWidth, quadHeight, texture);

  const presetUniforms = resolvedPreset?.uniforms ?? {};
  const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
  const customUniforms = config.uniforms ?? {};

  // Merge order: auto < preset < mask < custom
  return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
}, [quadWidth, quadHeight, texture, resolvedPreset, maskTexture, maskChannel, config.uniforms]);
```

## Step 6: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

### 6a. Export `MaskChannel` type

Add `MaskChannel` to the type exports from `./types`:

```ts
export type {
  // ... existing exports ...
  MaskChannel,
  // ... rest ...
} from "./types";
```

### 6b. Export mask utilities

```ts
export { buildMaskUniforms, prependMaskDefine } from "./utils/shaderDefaults";
```

### 6c. Export `useMaskTexture` hook

```ts
export { useMaskTexture } from "./hooks/useMaskTexture";
```

## Step 7: Update Demo to Showcase Mask Effect

**File:** `apps/demo/src/app/page.tsx`

Add a masked shader effect to demonstrate the feature. This requires a mask PNG in the demo's public folder.

### 7a. Create a test mask image

Place a mask image at `apps/demo/public/maps/demo-mask.png`. This should be the same dimensions as the base map image. Paint:
- Red regions where water effects should appear
- Green regions where glow effects should appear
- Black everywhere else

**Note:** For initial testing, a simple mask with red rectangles is sufficient.

### 7b. Add masked shader effects to demo config

Add to the `shaderEffects` array:

```tsx
{
  id: "masked-water",
  preset: "waterRipple",
  presetParams: { uSpeed: 0.8, uAmplitude: 0.015 },
  maskSrc: "/maps/demo-mask.png",
  maskChannel: "r",
  zIndex: 1.5,  // Between base layer and next layer
  space: "map",
},
{
  id: "masked-glow",
  preset: "glow",
  presetParams: { uIntensity: 0.6, uGlowColor: [0.2, 1.0, 0.3] },
  maskSrc: "/maps/demo-mask.png",
  maskChannel: "g",
  zIndex: 1.5,
  space: "map",
},
```

# Acceptance Criteria

1. `MaskChannel` type (`"r" | "g" | "b"`) is exported from the package.
2. `LayerShaderConfig` has optional `maskSrc` and `maskChannel` fields.
3. `ShaderEffectConfig` has optional `maskSrc` and `maskChannel` fields.
4. A new `useMaskTexture` hook handles conditional mask texture loading (imperative `TextureLoader`, not `useLoader`).
5. `buildMaskUniforms()` returns `uMaskTexture` and `uMaskChannelSelector` uniforms when a mask is active.
6. `prependMaskDefine()` prepends `#define HAS_MASK` to fragment shader source when mask is active.
7. All 5 built-in shader presets include `#ifdef HAS_MASK` blocks for mask-based alpha masking.
8. `resolveShaderPreset()` accepts a 4th `hasMask` parameter and prepends `#define HAS_MASK` when true.
9. `MapLayerMesh` loads mask texture and merges mask uniforms into the shader material.
10. `ShaderEffect` loads mask texture and merges mask uniforms into the shader material.
11. Custom (non-preset) fragment shaders receive `#define HAS_MASK` prepended when a mask is active, allowing them to use `#ifdef HAS_MASK` blocks.
12. Mask channel selection uses a `vec3` dot-product approach (no GLSL branching).
13. Mask textures are properly disposed on unmount or when `maskSrc` changes.
14. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 8a — Mask Texture Support for Shader Effects. Adds `maskSrc` and `maskChannel` to both `LayerShaderConfig` and `ShaderEffectConfig`. Implements `useMaskTexture` hook for conditional texture loading, `buildMaskUniforms()` and `prependMaskDefine()` helpers, `#ifdef HAS_MASK` support in all 5 shader presets, and integration into both `MapLayerMesh` and `ShaderEffect` components. Uses `vec3` dot-product channel selection to avoid GLSL branching.
