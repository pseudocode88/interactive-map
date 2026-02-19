---
Name: Chunk 7d-1 Layer Shader Support
Type: feature
Created On: 2026-02-19
Modified On: 2026-02-19 (review fixes)
---

# Brief

Add an escape hatch for advanced users to apply custom `ShaderMaterial` to existing map layers. When a `shaderConfig` is provided on a `MapLayer`, `MapLayerMesh` replaces its default `meshBasicMaterial` with a custom `ShaderMaterial`. The system auto-injects common uniforms (`uTime`, `uResolution`, `uTexture`, `uViewport`) so shaders can react to time and camera state out of the box.

# Plan & Instruction

## Step 1: Add Types

**File:** `packages/interactive-map/src/types/index.ts`

Add the following types **before** the `MapLayer` interface:

```ts
/**
 * Custom shader configuration for a map layer.
 * When provided, the layer uses ShaderMaterial instead of meshBasicMaterial.
 *
 * Auto-injected uniforms available in shaders:
 * - uTime (float): elapsed time in seconds
 * - uResolution (vec2): texture dimensions (width, height) in pixels
 * - uTexture (sampler2D): the layer's loaded texture
 * - uViewport (vec3): camera state (x, y, zoom)
 */
export interface LayerShaderConfig {
  /** GLSL vertex shader source. If omitted, a default passthrough vertex shader is used. */
  vertexShader?: string;
  /** GLSL fragment shader source. Required. */
  fragmentShader: string;
  /**
   * Additional custom uniforms to pass to the shader.
   * Values can be numbers, arrays (vec2/vec3/vec4), or Three.js objects (Color, Texture, etc.).
   * These are merged with the auto-injected uniforms (uTime, uResolution, uTexture, uViewport).
   * If a custom uniform name collides with an auto-injected one, the custom value takes precedence.
   */
  uniforms?: Record<string, { value: unknown }>;
  /** Whether the material should use transparent blending. Default: true */
  transparent?: boolean;
  /** Whether to write to the depth buffer. Default: false */
  depthWrite?: boolean;
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

Add `shaderConfig` to the `MapLayer` interface:

```ts
export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  animation?: LayerAnimation | LayerAnimation[];
  parallaxFactor?: number;
  /** Optional custom shader configuration. When provided, the layer renders with ShaderMaterial instead of meshBasicMaterial. */
  shaderConfig?: LayerShaderConfig;
}
```

## Step 2: Create Default Vertex Shader Constant

**File:** `packages/interactive-map/src/utils/shaderDefaults.ts` (new file)

Create a utility file with the default vertex shader and a helper to build auto-injected uniforms:

```ts
/**
 * Default vertex shader used when LayerShaderConfig.vertexShader is omitted.
 * Passes UV coordinates and renders the textured plane normally.
 */
export const DEFAULT_LAYER_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Builds the set of auto-injected uniforms for a layer shader.
 * Custom uniforms from the user's config are merged on top (user wins on collision).
 */
export function buildLayerShaderUniforms(
  texture: import("three").Texture,
  textureWidth: number,
  textureHeight: number,
  customUniforms?: Record<string, { value: unknown }>
): Record<string, { value: unknown }> {
  const autoUniforms: Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uResolution: { value: [textureWidth, textureHeight] },
    uTexture: { value: texture },
    uViewport: { value: [0, 0, 1] }, // [x, y, zoom]
  };

  if (customUniforms) {
    return { ...autoUniforms, ...customUniforms };
  }

  return autoUniforms;
}
```

## Step 3: Modify MapLayerMesh to Support Custom Shaders

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

### 3a. Add imports

Add to existing imports:
```ts
import { ShaderMaterial } from "three";
import type { LayerShaderConfig } from "../types";
import {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildLayerShaderUniforms,
} from "../utils/shaderDefaults";
```

### 3b. Add `shaderConfig` to `MapLayerMeshProps`

```ts
interface MapLayerMeshProps {
  // ... existing props ...
  shaderConfig?: LayerShaderConfig;
}
```

Add `shaderConfig` to the destructured props in the function signature.

### 3c. Create shader material uniforms (memoized) — separate objects for main and clone

After the existing `processedTexture` useMemo, add **two** separate uniform objects — one for the main mesh and one for the carousel clone. They must be independent objects so Three.js treats them as separate material state.

```ts
const shaderUniforms = useMemo(() => {
  if (!shaderConfig) return null;

  return buildLayerShaderUniforms(
    processedTexture,
    textureWidth,
    textureHeight,
    shaderConfig.uniforms
  );
}, [shaderConfig, processedTexture, textureWidth, textureHeight]);

const cloneShaderUniforms = useMemo(() => {
  if (!shaderConfig) return null;

  return buildLayerShaderUniforms(
    processedTexture,
    textureWidth,
    textureHeight,
    shaderConfig.uniforms
  );
}, [shaderConfig, processedTexture, textureWidth, textureHeight]);
```

**Important:** Do NOT share the same uniforms object between the main mesh and the carousel clone. Each `ShaderMaterial` must own its own uniforms object to avoid cross-contamination if per-instance data is ever needed.

### 3d. Add refs for the ShaderMaterials

```ts
const shaderMaterialRef = useRef<ShaderMaterial>(null);
const cloneShaderMaterialRef = useRef<ShaderMaterial>(null);
```

### 3e. Update uniforms every frame in `useFrame`

Inside the existing `useFrame` callback, **after** the existing parallax/animation logic and **before** the closing of the callback, update the material uniforms directly via the refs. Do NOT write to the intermediate `shaderUniforms`/`cloneShaderUniforms` objects — the ref's `.uniforms` IS the object, so write to it directly.

```ts
// Update main mesh shader uniforms
if (shaderMaterialRef.current) {
  const u = shaderMaterialRef.current.uniforms;
  u.uTime.value = elapsed.current;
  u.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
  u.uResolution.value = [textureWidth, textureHeight];
  u.uTexture.value = processedTexture;
}

// Update clone mesh shader uniforms (separate object, same values)
if (cloneShaderMaterialRef.current) {
  const u = cloneShaderMaterialRef.current.uniforms;
  u.uTime.value = elapsed.current;
  u.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
  u.uResolution.value = [textureWidth, textureHeight];
  u.uTexture.value = processedTexture;
}
```

### 3f. Conditionally render ShaderMaterial or meshBasicMaterial

Replace the current `<mesh>` JSX return. The mesh structure stays the same, but the material is conditional:

```tsx
<mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
  <planeGeometry args={[geoWidth, geoHeight]} />
  {shaderConfig && shaderUniforms ? (
    <shaderMaterial
      ref={shaderMaterialRef}
      vertexShader={shaderConfig.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
      fragmentShader={shaderConfig.fragmentShader}
      uniforms={shaderUniforms}
      transparent={shaderConfig.transparent ?? true}
      depthWrite={shaderConfig.depthWrite ?? false}
    />
  ) : (
    <meshBasicMaterial map={processedTexture} transparent />
  )}
</mesh>
```

Do the same for the carousel clone mesh (the second `<mesh>` inside the `hasCarousel` conditional). Use `cloneShaderMaterialRef` and `cloneShaderUniforms` (NOT the main mesh's uniforms):

```tsx
{hasCarousel ? (
  <mesh ref={cloneRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
    <planeGeometry args={[geoWidth, geoHeight]} />
    {shaderConfig && cloneShaderUniforms ? (
      <shaderMaterial
        ref={cloneShaderMaterialRef}
        vertexShader={shaderConfig.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER}
        fragmentShader={shaderConfig.fragmentShader}
        uniforms={cloneShaderUniforms}
        transparent={shaderConfig.transparent ?? true}
        depthWrite={shaderConfig.depthWrite ?? false}
      />
    ) : (
      <meshBasicMaterial map={processedTexture} transparent />
    )}
  </mesh>
) : null}
```

### 3g. Handle opacity animation with shader material

In the existing `useFrame` where `animationResult.opacity` is applied, add a branch for shader materials:

```ts
if (animationResult.opacity !== null) {
  if (shaderMaterialRef.current) {
    // If the user's shader has a uOpacity uniform, update it
    if (shaderMaterialRef.current.uniforms.uOpacity) {
      shaderMaterialRef.current.uniforms.uOpacity.value = animationResult.opacity;
    }
    shaderMaterialRef.current.opacity = animationResult.opacity;
  } else {
    const material = meshRef.current.material;
    if ("opacity" in material) {
      material.opacity = animationResult.opacity;
    }
  }
}
```

## Step 4: Pass shaderConfig Through MapScene

**File:** `packages/interactive-map/src/components/MapScene.tsx`

In the `sortedLayers.map()` where `MapLayerMesh` is rendered, pass the new prop:

```tsx
<MapLayerMesh
  key={layer.id}
  // ... existing props ...
  shaderConfig={layer.shaderConfig}
/>
```

No changes needed to `MapSceneProps` — it already receives `layers: MapLayer[]` which will carry the `shaderConfig`.

## Step 5: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

Add `LayerShaderConfig` to the type exports:

```ts
export type {
  // ... existing exports ...
  LayerShaderConfig,
  // ... rest ...
} from "./types";
```

## Step 6: Update Demo App

**File:** `apps/demo/src/app/page.tsx` (or wherever the demo config lives)

Add one demo layer that uses a custom shader to verify the feature works. A simple tint shader is good for testing:

```ts
{
  id: "shader-demo",
  src: "/some-existing-layer.png",
  zIndex: 5,
  shaderConfig: {
    fragmentShader: `
      uniform sampler2D uTexture;
      uniform float uTime;
      varying vec2 vUv;

      void main() {
        vec4 color = texture2D(uTexture, vUv);
        // Simple time-based color tint to prove uniforms work
        color.r *= 0.5 + 0.5 * sin(uTime);
        gl_FragColor = color;
      }
    `,
  },
}
```

This step is optional — only add if there is a suitable layer to test with. If not, skip and verify manually.

# Acceptance Criteria

1. A `MapLayer` with `shaderConfig` renders using `ShaderMaterial` instead of `meshBasicMaterial`
2. A `MapLayer` **without** `shaderConfig` renders exactly as before (no regression)
3. Auto-injected uniforms (`uTime`, `uResolution`, `uTexture`, `uViewport`) are available and update every frame
4. Custom uniforms provided via `shaderConfig.uniforms` are passed through and accessible in GLSL
5. Custom uniforms take precedence over auto-injected uniforms on name collision
6. If `vertexShader` is omitted, the default passthrough vertex shader is used
7. Layer animations (bounce, fade, wobble, carousel) still work correctly when a custom shader is applied
8. Parallax still works correctly on shader layers (both depth and drift modes)
9. Carousel clone mesh also uses the shader material when `shaderConfig` is present
10. `LayerShaderConfig` type is exported from the package barrel
11. The app builds without errors (`pnpm build`)

# Log

- 2026-02-19: Created plan for Chunk 7d-1 — Layer Shader Support. Covers types, default vertex shader utility, MapLayerMesh modifications, MapScene passthrough, and barrel exports.
- 2026-02-19: Review fixes — (1) Separate uniforms objects for main mesh and carousel clone to avoid shared-reference bugs. (2) Remove redundant double-write of uniform values; update material uniforms directly via refs instead of writing to intermediate object first.
