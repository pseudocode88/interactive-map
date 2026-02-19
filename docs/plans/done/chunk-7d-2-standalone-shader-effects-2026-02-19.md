---
Name: Chunk 7d-2 — Standalone Shader Effects
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add a standalone shader effect system to `InteractiveMap` that renders custom `ShaderMaterial` quads on the map without requiring an existing layer. Unlike layer shaders (7d-1) which replace a layer's material, standalone shader effects create their own geometry — either covering the full base image or a defined rectangular region. An optional texture can be provided and auto-injected as `uTexture`. The system auto-injects common uniforms (`uTime`, `uResolution`, `uViewport`) so shaders react to time and camera state out of the box. Standalone shader effects participate in the existing parallax system.

Use cases: procedural animated gradients, vignettes, noise overlays, water caustics, light rays, or any effect that uses a texture + custom shader without being tied to a specific layer.

# Plan & Instruction

## Step 1: Add Types

**File:** `packages/interactive-map/src/types/index.ts`

Add the following interface **after** the `ParticleEffectConfig` interface and **before** `InteractiveMapProps`:

```ts
export interface ShaderEffectConfig {
  /** Unique ID for this shader effect */
  id: string;
  /** GLSL fragment shader source. Required. */
  fragmentShader: string;
  /** GLSL vertex shader source. If omitted, a default passthrough vertex shader is used. */
  vertexShader?: string;
  /**
   * Optional texture URL (PNG). If provided, the texture is loaded and injected as `uTexture` (sampler2D).
   * If omitted, `uTexture` is not available in the shader.
   */
  src?: string;
  /**
   * Optional rectangular region in base image pixel coordinates.
   * If omitted, the shader quad covers the entire base image (baseWidth × baseHeight).
   */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Additional custom uniforms to pass to the shader.
   * Values can be numbers, arrays (vec2/vec3/vec4), or Three.js objects (Color, Texture, etc.).
   * These are merged with the auto-injected uniforms. Custom values take precedence on collision.
   */
  uniforms?: Record<string, { value: unknown }>;
  /** Whether the material should use transparent blending. Default: true */
  transparent?: boolean;
  /** Whether to write to the depth buffer. Default: false */
  depthWrite?: boolean;
  /** zIndex for depth ordering (same system as MapLayer). Default: 12 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this shader effect.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /**
   * Optional preset name (for Chunk 7d-3). When set, vertexShader/fragmentShader are ignored
   * and the preset's shaders are used instead.
   * Reserved for future use — not implemented in this chunk.
   */
  preset?: string;
  /**
   * Optional preset-specific parameters (for Chunk 7d-3).
   * Reserved for future use — not implemented in this chunk.
   */
  presetParams?: Record<string, unknown>;
}
```

Add `shaderEffects` to `InteractiveMapProps`:

```ts
export interface InteractiveMapProps {
  // ... existing props ...
  /** Array of standalone shader effect configurations */
  shaderEffects?: ShaderEffectConfig[];
}
```

## Step 2: Create Standalone Shader Uniform Builder

**File:** `packages/interactive-map/src/utils/shaderDefaults.ts` (modify existing file)

Add a new function below the existing `buildLayerShaderUniforms`. This builder differs from the layer version because `uTexture` is optional (only injected when a texture is provided) and `uResolution` reflects the quad size (region or base image), not a texture.

```ts
/**
 * Builds the set of auto-injected uniforms for a standalone shader effect.
 * Unlike layer shaders, uTexture is only included when a texture is provided.
 * Custom uniforms from the user's config are merged on top (user wins on collision).
 */
export function buildStandaloneShaderUniforms(
  quadWidth: number,
  quadHeight: number,
  texture?: import("three").Texture | null,
  customUniforms?: Record<string, { value: unknown }>
): Record<string, { value: unknown }> {
  const autoUniforms: Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uResolution: { value: [quadWidth, quadHeight] },
    uViewport: { value: [0, 0, 1] },
  };

  if (texture) {
    autoUniforms.uTexture = { value: texture };
  }

  if (customUniforms) {
    return { ...autoUniforms, ...customUniforms };
  }

  return autoUniforms;
}
```

## Step 3: Create `ShaderEffect` Component

**File:** `packages/interactive-map/src/components/ShaderEffect.tsx` (new file)

### Props

```ts
interface ShaderEffectProps {
  config: ShaderEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}
```

### Implementation approach

1. **Conditionally load texture**: If `config.src` is provided, load with `useLoader(TextureLoader, config.src)`. Set `colorSpace = SRGBColorSpace`, `minFilter = LinearFilter`, `magFilter = LinearFilter`. If `config.src` is not provided, skip texture loading entirely (no `useLoader` call — use a wrapper component pattern to handle the conditional hook, see step 3b).

2. **Compute quad dimensions**:
   - If `config.region` is provided: `quadWidth = region.width`, `quadHeight = region.height`.
   - If no region: `quadWidth = baseWidth`, `quadHeight = baseHeight`.

3. **Compute quad world position** (center of the quad in world space):
   - If region is provided:
     - `worldX = region.x + region.width / 2 - baseWidth / 2`
     - `worldY = baseHeight / 2 - (region.y + region.height / 2)`
   - If no region (fullscreen): `worldX = 0`, `worldY = 0` (centered on base image origin).

4. **Build uniforms** using `buildStandaloneShaderUniforms(quadWidth, quadHeight, texture, config.uniforms)`. Store in `useMemo`.

5. **Shader material**: Use a `<shaderMaterial>` with:
   - `vertexShader`: `config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER` (reuse the existing default from `shaderDefaults.ts`).
   - `fragmentShader`: `config.fragmentShader`.
   - `uniforms`: the built uniforms.
   - `transparent`: `config.transparent ?? true`.
   - `depthWrite`: `config.depthWrite ?? false`.

6. **Ref** for the `ShaderMaterial` (`shaderMaterialRef`).

7. **`useFrame` loop** — update uniforms every frame directly via ref (same pattern as layer shaders):
   ```ts
   if (shaderMaterialRef.current) {
     const u = shaderMaterialRef.current.uniforms;
     u.uTime.value = elapsed.current;
     u.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
     u.uResolution.value = [quadWidth, quadHeight];
     if (u.uTexture && texture) {
       u.uTexture.value = texture;
     }
   }
   ```

8. **Parallax** — apply the same parallax logic as `FogEffect` / other effects:
   - Pan offset: `viewport.x * (1 - parallaxFactor)` / `viewport.y * (1 - parallaxFactor)` added to mesh position.
   - Drift mode: additional zoom-based positional offset.
   - Depth mode: scale the mesh by `layerZoom / baseZoom`.
   - Apply via direct mesh mutation in `useFrame`.

9. **Delta accumulation** — cap delta at 0.1s (same as other effects) to handle tab visibility pauses.

10. **Z-positioning**: `mesh.position.z = (config.zIndex ?? 12) * 0.01`.

### 3b. Conditional texture loading (wrapper pattern)

Since React hooks cannot be called conditionally, use a wrapper component pattern:

```tsx
// Outer component — decides whether to load a texture
export function ShaderEffect(props: ShaderEffectProps) {
  if (props.config.src) {
    return <ShaderEffectWithTexture {...props} />;
  }
  return <ShaderEffectInner {...props} texture={null} />;
}

// Loads texture then delegates to inner
function ShaderEffectWithTexture(props: ShaderEffectProps) {
  const rawTexture = useLoader(TextureLoader, props.config.src!);
  const texture = useMemo(() => {
    rawTexture.colorSpace = SRGBColorSpace;
    rawTexture.minFilter = LinearFilter;
    rawTexture.magFilter = LinearFilter;
    rawTexture.needsUpdate = true;
    return rawTexture;
  }, [rawTexture]);

  return <ShaderEffectInner {...props} texture={texture} />;
}
```

The `ShaderEffectInner` component contains all the core logic (uniforms, useFrame, parallax, JSX) and receives `texture: Texture | null` as a prop.

### Full `ShaderEffectInner` component skeleton

```tsx
import { useFrame, useLoader } from "@react-three/fiber";
import type { RefObject } from "react";
import { useMemo, useRef } from "react";
import {
  LinearFilter,
  Mesh,
  ShaderMaterial,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import type { Texture } from "three";
import type { ShaderEffectConfig } from "../types";
import {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildStandaloneShaderUniforms,
} from "../utils/shaderDefaults";
import { computeParallaxScale } from "../utils/parallax";

interface ShaderEffectProps {
  config: ShaderEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

interface ShaderEffectInnerProps extends ShaderEffectProps {
  texture: Texture | null;
}

function ShaderEffectInner({
  config,
  baseWidth,
  baseHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
  texture,
}: ShaderEffectInnerProps) {
  const meshRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);

  // Compute quad dimensions
  const quadWidth = config.region ? config.region.width : baseWidth;
  const quadHeight = config.region ? config.region.height : baseHeight;

  // Compute quad center in world coordinates
  const basePosition = useMemo(() => {
    if (config.region) {
      return {
        x: config.region.x + config.region.width / 2 - baseWidth / 2,
        y: baseHeight / 2 - (config.region.y + config.region.height / 2),
      };
    }
    return { x: 0, y: 0 };
  }, [config.region, baseWidth, baseHeight]);

  const zIndex = config.zIndex ?? 12;

  // Build uniforms
  const shaderUniforms = useMemo(() => {
    return buildStandaloneShaderUniforms(
      quadWidth,
      quadHeight,
      texture,
      config.uniforms
    );
  }, [quadWidth, quadHeight, texture, config.uniforms]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    // Update shader uniforms
    if (shaderMaterialRef.current) {
      const u = shaderMaterialRef.current.uniforms;
      u.uTime.value = elapsed.current;
      const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
      u.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
      u.uResolution.value = [quadWidth, quadHeight];
      if (u.uTexture && texture) {
        u.uTexture.value = texture;
      }
    }

    // Parallax
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

    // Scale (parallax depth mode)
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

    meshRef.current.scale.set(scaleX, scaleY, 1);
  });

  return (
    <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
      <planeGeometry args={[quadWidth, quadHeight]} />
      <shaderMaterial
        ref={shaderMaterialRef}
        vertexShader={config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
        fragmentShader={config.fragmentShader}
        uniforms={shaderUniforms}
        transparent={config.transparent ?? true}
        depthWrite={config.depthWrite ?? false}
      />
    </mesh>
  );
}

function ShaderEffectWithTexture(props: ShaderEffectProps) {
  const rawTexture = useLoader(TextureLoader, props.config.src!);
  const texture = useMemo(() => {
    rawTexture.colorSpace = SRGBColorSpace;
    rawTexture.minFilter = LinearFilter;
    rawTexture.magFilter = LinearFilter;
    rawTexture.needsUpdate = true;
    return rawTexture;
  }, [rawTexture]);

  return <ShaderEffectInner {...props} texture={texture} />;
}

export function ShaderEffect(props: ShaderEffectProps) {
  if (props.config.src) {
    return <ShaderEffectWithTexture {...props} />;
  }
  return <ShaderEffectInner {...props} texture={null} />;
}
```

## Step 4: Integrate into `MapScene`

**File:** `packages/interactive-map/src/components/MapScene.tsx`

### 4a. Add imports

```ts
import { ShaderEffect } from "./ShaderEffect";
```

Add `ShaderEffectConfig` to the type import from `"../types"`:

```ts
import type {
  FogEffectConfig,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  PanConfig,
  ParallaxConfig,
  ShaderEffectConfig,
  SpriteEffectConfig,
  ZoomConfig,
} from "../types";
```

### 4b. Add prop to `MapSceneProps`

```ts
interface MapSceneProps {
  // ... existing props ...
  shaderEffects?: ShaderEffectConfig[];
}
```

### 4c. Destructure the new prop

Add `shaderEffects` to the destructured props in the function signature.

### 4d. Render shader effects

Add this block **after** the `particleEffects` section and **before** the `spriteEffects` section. This places standalone shaders at a default zIndex of 12, above particles (11) but below sprites, though the actual ordering is controlled by each effect's `zIndex * 0.01` z-position.

```tsx
{(shaderEffects ?? []).map((effect) => {
  const parallaxFactor =
    !parallaxConfig || effect.parallaxFactor !== undefined
      ? (effect.parallaxFactor ?? 1)
      : computeParallaxFactor(
          {
            id: effect.id,
            src: effect.src ?? "",
            zIndex: effect.zIndex ?? 12,
            parallaxFactor: effect.parallaxFactor,
          },
          baseLayerZIndex,
          parallaxConfig.intensity
        );

  return (
    <ShaderEffect
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

## Step 5: Wire Through `InteractiveMap`

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

### 5a. Accept `shaderEffects` from props

Add `shaderEffects` to the destructured props:

```ts
export function InteractiveMap({
  // ... existing props ...
  shaderEffects,
}: InteractiveMapProps) {
```

### 5b. Pass to `MapScene`

Add `shaderEffects={shaderEffects}` to the `<MapScene>` JSX:

```tsx
<MapScene
  // ... existing props ...
  shaderEffects={shaderEffects}
/>
```

## Step 6: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

Add `ShaderEffectConfig` to the type exports:

```ts
export type {
  // ... existing exports ...
  ShaderEffectConfig,
  // ... rest ...
} from "./types";
```

Also export `buildStandaloneShaderUniforms` and `DEFAULT_LAYER_VERTEX_SHADER` from the utils, so advanced users can use them in their own shader setups:

```ts
export {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildStandaloneShaderUniforms,
} from "./utils/shaderDefaults";
```

**Note:** Check if `buildLayerShaderUniforms` and `DEFAULT_LAYER_VERTEX_SHADER` are already exported. If `DEFAULT_LAYER_VERTEX_SHADER` is already exported, only add `buildStandaloneShaderUniforms`. If neither are exported, add both plus `buildStandaloneShaderUniforms`.

## Step 7: Update Demo App

**File:** `apps/demo/src/app/page.tsx` (or wherever the demo config lives)

Add a `shaderEffects` config to the demo `InteractiveMap` usage. A simple procedural vignette shader is a good demo — no texture needed:

```tsx
shaderEffects={[
  {
    id: "vignette",
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uResolution;
      varying vec2 vUv;

      void main() {
        // Animated vignette: darkens edges, pulses subtly
        vec2 center = vUv - 0.5;
        float dist = length(center);
        float pulse = 0.85 + 0.15 * sin(uTime * 0.5);
        float vignette = smoothstep(0.4 * pulse, 0.7, dist);
        gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.4);
      }
    `,
    zIndex: 15,
  },
]}
```

This step is optional — only add if there is a suitable place in the demo. If not, skip and verify manually.

# Acceptance Criteria

1. A new `ShaderEffectConfig` type is defined in `types/index.ts` with all fields documented.
2. `shaderEffects` prop is accepted by `InteractiveMap` and typed as `ShaderEffectConfig[]`.
3. A standalone shader effect without `region` renders a fullscreen quad covering the entire base image dimensions.
4. A standalone shader effect with `region` renders a quad at the specified position and size in base image pixel coordinates.
5. Auto-injected uniforms (`uTime`, `uResolution`, `uViewport`) are available and update every frame.
6. When `src` is provided, the texture is loaded and injected as `uTexture` (sampler2D). When `src` is omitted, `uTexture` is not injected.
7. Custom uniforms provided via `config.uniforms` are passed through and accessible in GLSL. Custom uniforms take precedence over auto-injected uniforms on name collision.
8. If `vertexShader` is omitted, the default passthrough vertex shader is used (same as layer shaders).
9. `transparent` defaults to `true`, `depthWrite` defaults to `false`.
10. Shader effects participate in parallax when `parallaxConfig` is provided on the map (both depth and drift modes).
11. Multiple standalone shader effects can coexist with different shaders, regions, and depths.
12. Z-ordering works correctly via `zIndex` (default: 12), consistent with the `zIndex * 0.01` system.
13. Performance: shader effects use direct mesh/material uniform mutation in `useFrame` (zero React re-renders).
14. Delta is capped at 0.1s to handle tab visibility pauses (consistent with other effects).
15. `ShaderEffectConfig` type and `buildStandaloneShaderUniforms` utility are exported from the package barrel.
16. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 7d-2 — Standalone Shader Effects. Covers types (`ShaderEffectConfig`), standalone uniform builder utility, `ShaderEffect` component with conditional texture loading (wrapper pattern), fullscreen and region-based quad sizing, auto-injected uniforms (`uTime`, `uResolution`, `uViewport`, optional `uTexture`), parallax integration (depth + drift), MapScene/InteractiveMap wiring, barrel exports, and optional demo with procedural vignette shader.
- **2026-02-19 (Implementation):** Implementation added `space: "map" | "viewport"` option beyond original plan. Viewport-space mode makes the shader quad follow the camera (screen-fixed overlay), useful for vignettes, HUD effects, etc. Quad scales inversely with zoom to maintain consistent screen coverage.
