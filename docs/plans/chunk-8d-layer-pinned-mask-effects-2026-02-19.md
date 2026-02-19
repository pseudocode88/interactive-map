---
Name: Chunk 8d — Layer-Pinned Mask Effects
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief

Add the ability to **pin mask effects to a specific map layer**, so that the mask effect inherits the layer's full transform — parallax, pan, zoom scaling, carousel movement, and layer animations — via the Three.js scene graph (parent-child relationship).

Currently (Chunk 8c), mask effects are resolved into standalone `ShaderEffect` / `ParticleEffect` components that are **siblings** to map layers. Each independently computes its own parallax/pan/zoom offsets. This works but means effects can drift from the layer they're meant to decorate if parallax factors don't match exactly, and carousel animations are not inherited at all.

With pinning, the mask effect mesh becomes a **child** of the target layer's `<mesh>` element. Three.js automatically propagates the parent's position and scale to children, so the effect moves/scales exactly with the layer — zero logic duplication, zero drift.

**Depends on:** Chunk 8c (mask effect mapping).

# Plan & Instruction

## Step 1: Add `pinnedTo` Field to `MaskEffectConfig`

**File:** `packages/interactive-map/src/types/index.ts`

### 1a. Add `pinnedTo` to `MaskEffectConfig`

Add the following field to the `MaskEffectConfig` interface, after the `src` field:

```ts
  /**
   * Pin this mask effect group to a specific map layer by its ID.
   * When set, effects become children of the layer's mesh in the scene graph,
   * inheriting all transforms: parallax, pan, zoom scaling, carousel, and animations.
   * The mask image dimensions should match the pinned layer's image dimensions.
   *
   * When pinnedTo is set, these fields are ignored (inherited from the layer):
   * - space (always "map")
   * - parallaxFactor (inherited from layer)
   * - zIndex (rendered as child of the layer mesh)
   */
  pinnedTo?: string;
```

### 1b. Add `PinnedShaderEffectConfig` type

Add after the `MaskEffectConfig` interface:

```ts
/**
 * Internal config for a shader effect pinned to a layer.
 * Similar to ShaderEffectConfig but without positioning/parallax fields.
 * These are rendered as children of a MapLayerMesh.
 */
export interface PinnedShaderEffectConfig {
  /** Unique ID for this pinned shader effect */
  id: string;
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
  /** Optional texture URL for the shader */
  src?: string;
  /** Mask texture URL */
  maskSrc?: string;
  /** Mask channel to sample */
  maskChannel?: MaskChannel;
  /** Whether the material uses transparent blending. Default: true */
  transparent?: boolean;
  /** Z-offset within the parent layer (0.001 increments). Default: 0.001 */
  localZOffset?: number;
}

/**
 * Internal config for a particle effect pinned to a layer.
 * Similar to ParticleEffectConfig but without positioning/parallax fields.
 * Particle positions are computed in layer-local coordinates.
 */
export interface PinnedParticleEffectConfig {
  /** Unique ID for this pinned particle effect */
  id: string;
  /** Visual mode. Default: "twinkle" */
  mode?: "twinkle" | "drift";
  /** Maximum particle count. Default: 50 */
  maxCount?: number;
  /** Particle color (CSS string). Default: "#ffffff" */
  color?: string;
  /** Base particle size in pixels. Default: 3 */
  size?: number;
  /** Size variance factor (0-1). Default: 0.3 */
  sizeVariance?: number;
  /** Optional particle texture URL */
  src?: string;
  /** Twinkle duration in seconds. Default: 2 */
  twinkleDuration?: number;
  /** Twinkle duration variance (0-1). Default: 0.5 */
  twinkleDurationVariance?: number;
  /** Drift direction as normalized vector. Default: { x: 0, y: 1 } */
  driftDirection?: { x: number; y: number };
  /** Drift direction variance in degrees. Default: 15 */
  driftDirectionVariance?: number;
  /** Drift speed in px/s. Default: 30 */
  driftSpeed?: number;
  /** Drift speed variance (0-1). Default: 0.3 */
  driftSpeedVariance?: number;
  /** Drift distance in px. Default: 100 */
  driftDistance?: number;
  /** Base opacity (0-1). Default: 1 */
  opacity?: number;
  /** Mask texture URL */
  maskSrc?: string;
  /** Mask channel to sample */
  maskChannel?: MaskChannel;
  /** Mask behavior. Default: "both" */
  maskBehavior?: "spawn" | "constrain" | "both";
  /** Mask threshold. Default: 0.1 */
  maskThreshold?: number;
  /** Z-offset within the parent layer (0.001 increments). Default: 0.002 */
  localZOffset?: number;
}
```

### 1c. Add `PinnedEffects` aggregate type

```ts
/**
 * Collection of pinned effects to render as children of a map layer mesh.
 */
export interface PinnedEffects {
  shaderEffects: PinnedShaderEffectConfig[];
  particleEffects: PinnedParticleEffectConfig[];
}
```

## Step 2: Update Mask Effect Resolver for Pinned Effects

**File:** `packages/interactive-map/src/utils/maskEffectResolver.ts`

### 2a. Update the `ResolvedMaskEffects` interface

Add pinned effects map to the return type:

```ts
interface ResolvedMaskEffects {
  shaderEffects: ShaderEffectConfig[];
  particleEffects: ParticleEffectConfig[];
  /** Map of layerId → pinned effects for that layer */
  pinnedEffects: Map<string, PinnedEffects>;
}
```

### 2b. Add pinned resolver functions

Add two new helper functions for resolving pinned effects:

```ts
function resolvePinnedParticleEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Extract<MaskChannelEffect, { type: "particles" }>
): PinnedParticleEffectConfig {
  return {
    id: `${config.id}-${key}-particles`,
    mode: channelEffect.config.mode,
    maxCount: channelEffect.config.maxCount,
    color: channelEffect.config.color,
    size: channelEffect.config.size,
    sizeVariance: channelEffect.config.sizeVariance,
    src: channelEffect.config.src,
    twinkleDuration: channelEffect.config.twinkleDuration,
    twinkleDurationVariance: channelEffect.config.twinkleDurationVariance,
    driftDirection: channelEffect.config.driftDirection,
    driftDirectionVariance: channelEffect.config.driftDirectionVariance,
    driftSpeed: channelEffect.config.driftSpeed,
    driftSpeedVariance: channelEffect.config.driftSpeedVariance,
    driftDistance: channelEffect.config.driftDistance,
    opacity: channelEffect.config.opacity,
    maskSrc: config.src,
    maskChannel: channel,
    maskBehavior: config.maskBehavior ?? "both",
    maskThreshold: config.maskThreshold ?? 0.1,
    localZOffset: 0.002,
  };
}

function resolvePinnedShaderEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Exclude<MaskChannelEffect, { type: "particles" }>
): PinnedShaderEffectConfig {
  return {
    id: `${config.id}-${key}-shader`,
    preset: channelEffect.preset,
    presetParams: channelEffect.presetParams,
    fragmentShader: channelEffect.fragmentShader,
    vertexShader: channelEffect.vertexShader,
    uniforms: channelEffect.uniforms,
    src: channelEffect.src,
    maskSrc: config.src,
    maskChannel: channel,
    transparent: config.transparent ?? true,
    localZOffset: 0.001,
  };
}
```

### 2c. Update `resolveMaskEffects` to handle `pinnedTo`

When `config.pinnedTo` is set, route channel effects to pinned configs instead of standalone configs:

```ts
export function resolveMaskEffects(config: MaskEffectConfig): ResolvedMaskEffects {
  const shaderEffects: ShaderEffectConfig[] = [];
  const particleEffects: ParticleEffectConfig[] = [];
  const pinnedEffects = new Map<string, PinnedEffects>();

  const isPinned = !!config.pinnedTo;

  for (const { key, channel } of CHANNELS) {
    const channelEffect: MaskChannelEffect | undefined = config[key];
    if (!channelEffect) {
      continue;
    }

    if (isPinned) {
      const layerId = config.pinnedTo!;
      if (!pinnedEffects.has(layerId)) {
        pinnedEffects.set(layerId, { shaderEffects: [], particleEffects: [] });
      }
      const pinned = pinnedEffects.get(layerId)!;

      if (channelEffect.type === "particles") {
        pinned.particleEffects.push(
          resolvePinnedParticleEffect(config, key, channel, channelEffect)
        );
      } else {
        pinned.shaderEffects.push(
          resolvePinnedShaderEffect(config, key, channel, channelEffect)
        );
      }
      continue;
    }

    // Existing standalone path (unchanged)
    if (channelEffect.type === "particles") {
      particleEffects.push(resolveParticleEffect(config, key, channel, channelEffect));
      continue;
    }
    shaderEffects.push(resolveShaderEffect(config, key, channel, channelEffect));
  }

  return { shaderEffects, particleEffects, pinnedEffects };
}
```

### 2d. Update `resolveAllMaskEffects` to merge pinned maps

```ts
export function resolveAllMaskEffects(configs: MaskEffectConfig[]): ResolvedMaskEffects {
  const allShaderEffects: ShaderEffectConfig[] = [];
  const allParticleEffects: ParticleEffectConfig[] = [];
  const allPinnedEffects = new Map<string, PinnedEffects>();

  for (const config of configs) {
    const resolved = resolveMaskEffects(config);
    allShaderEffects.push(...resolved.shaderEffects);
    allParticleEffects.push(...resolved.particleEffects);

    // Merge pinned effects by layerId
    for (const [layerId, pinned] of resolved.pinnedEffects) {
      if (!allPinnedEffects.has(layerId)) {
        allPinnedEffects.set(layerId, { shaderEffects: [], particleEffects: [] });
      }
      const existing = allPinnedEffects.get(layerId)!;
      existing.shaderEffects.push(...pinned.shaderEffects);
      existing.particleEffects.push(...pinned.particleEffects);
    }
  }

  return {
    shaderEffects: allShaderEffects,
    particleEffects: allParticleEffects,
    pinnedEffects: allPinnedEffects,
  };
}
```

## Step 3: Create `PinnedShaderEffect` Component

**File:** `packages/interactive-map/src/components/PinnedShaderEffect.tsx` (new file)

This is a lightweight shader effect component designed to be rendered as a **child** of a `<mesh>`. It does NOT compute any position or scale — the parent mesh's transforms are inherited automatically via the Three.js scene graph.

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
  type Texture,
} from "three";
import type { PinnedShaderEffectConfig } from "../types";
import { useMaskTexture } from "../hooks/useMaskTexture";
import {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildMaskUniforms,
  buildStandaloneShaderUniforms,
  prependMaskDefine,
} from "../utils/shaderDefaults";
import { resolveShaderPreset } from "../utils/shaderPresets";

interface PinnedShaderEffectProps {
  config: PinnedShaderEffectConfig;
  /** Width of the parent layer's geometry (includes autoScale) */
  geoWidth: number;
  /** Height of the parent layer's geometry (includes autoScale) */
  geoHeight: number;
  /** Viewport ref for uViewport uniform */
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}

interface PinnedShaderEffectInnerProps extends PinnedShaderEffectProps {
  texture: Texture | null;
}

function PinnedShaderEffectInner({
  config,
  geoWidth,
  geoHeight,
  viewportRef,
  texture,
}: PinnedShaderEffectInnerProps) {
  const meshRef = useRef<Mesh>(null);
  const shaderMaterialRef = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
  const maskTexture = useMaskTexture(config.maskSrc);
  const maskChannel = config.maskChannel ?? "r";
  const hasMask = !!maskTexture;
  const localZOffset = config.localZOffset ?? 0.001;

  const resolvedPreset = useMemo(() => {
    if (!config.preset) return null;
    return resolveShaderPreset(config.preset, config.presetParams, !!texture, hasMask);
  }, [config.preset, config.presetParams, texture, hasMask]);

  const effectiveVertexShader =
    resolvedPreset?.vertexShader ?? config.vertexShader ?? DEFAULT_LAYER_VERTEX_SHADER;

  const effectiveFragmentShader =
    resolvedPreset?.fragmentShader ??
    prependMaskDefine(config.fragmentShader ?? "", hasMask);

  const shaderUniforms = useMemo(() => {
    const autoUniforms = buildStandaloneShaderUniforms(geoWidth, geoHeight, texture);
    const presetUniforms = resolvedPreset?.uniforms ?? {};
    const maskUniforms = buildMaskUniforms(maskTexture, maskChannel);
    const customUniforms = config.uniforms ?? {};
    return { ...autoUniforms, ...presetUniforms, ...maskUniforms, ...customUniforms };
  }, [geoWidth, geoHeight, texture, resolvedPreset, maskTexture, maskChannel, config.uniforms]);

  const hasShader = !!config.preset || !!config.fragmentShader;

  // Only update shader uniforms — NO position/scale logic (parent handles it)
  useFrame((_, delta) => {
    if (!shaderMaterialRef.current || !hasShader) return;

    const cappedDelta = Math.min(delta, 0.1);
    elapsed.current += cappedDelta;

    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const uniforms = shaderMaterialRef.current.uniforms;
    uniforms.uTime.value = elapsed.current;
    uniforms.uViewport.value = [viewport.x, viewport.y, viewport.zoom];
    uniforms.uResolution.value = [geoWidth, geoHeight];
    if (uniforms.uTexture && texture) {
      uniforms.uTexture.value = texture;
    }
  });

  if (!hasShader) return null;

  // Render at local position (0, 0, localZOffset) — parent transform is inherited
  return (
    <mesh ref={meshRef} position={[0, 0, localZOffset]}>
      <planeGeometry args={[geoWidth, geoHeight]} />
      <shaderMaterial
        ref={shaderMaterialRef}
        vertexShader={effectiveVertexShader}
        fragmentShader={effectiveFragmentShader}
        uniforms={shaderUniforms}
        transparent={config.transparent ?? true}
        depthWrite={false}
      />
    </mesh>
  );
}

function PinnedShaderEffectWithTexture(props: PinnedShaderEffectProps) {
  const rawTexture = useLoader(TextureLoader, props.config.src!);
  const texture = useMemo(() => {
    rawTexture.colorSpace = SRGBColorSpace;
    rawTexture.minFilter = LinearFilter;
    rawTexture.magFilter = LinearFilter;
    rawTexture.needsUpdate = true;
    return rawTexture;
  }, [rawTexture]);
  return <PinnedShaderEffectInner {...props} texture={texture} />;
}

export function PinnedShaderEffect(props: PinnedShaderEffectProps) {
  if (props.config.src) {
    return <PinnedShaderEffectWithTexture {...props} />;
  }
  return <PinnedShaderEffectInner {...props} texture={null} />;
}
```

**Key difference from standalone `ShaderEffect`:**
- No `parallaxFactor`, `parallaxMode`, `baseWidth`, `baseHeight` props
- No position/scale computation in `useFrame` — parent mesh handles all transforms
- Uses `geoWidth`/`geoHeight` (the parent layer's actual geometry size) for the quad and uniforms
- Positioned at local `(0, 0, localZOffset)` — the slight z-offset ensures it renders on top of the parent layer's texture

## Step 4: Create `PinnedParticleEffect` Component

**File:** `packages/interactive-map/src/components/PinnedParticleEffect.tsx` (new file)

A lightweight particle effect component designed to be rendered as a **child** of a `<mesh>`. Particle positions are computed in **layer-local coordinates**. The parent mesh's transforms handle world positioning.

```tsx
import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  LinearFilter,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import type { PinnedParticleEffectConfig } from "../types";
import { useMaskSampler } from "../hooks/useMaskSampler";
import {
  createMaskedParticle,
  initializeMaskedParticles,
  initializeParticles,
  updateMaskedDriftParticle,
  updateMaskedTwinkleParticle,
  updateDriftParticle,
  updateTwinkleParticle,
  type ParticleInstance,
} from "../utils/particles";

interface PinnedParticleEffectProps {
  config: PinnedParticleEffectConfig;
  /** Width of the parent layer's geometry (includes autoScale) */
  geoWidth: number;
  /** Height of the parent layer's geometry (includes autoScale) */
  geoHeight: number;
  /** Viewport ref for reading current viewport state */
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
}
```

Use the same vertex/fragment shaders as the standalone `ParticleEffect` (the `VERTEX_SHADER`, `FRAGMENT_SHADER_CIRCLE`, `FRAGMENT_SHADER_TEXTURE` constants). Either import them from a shared location, or duplicate them in this file. Prefer extracting to a shared file if clean, otherwise duplicate (they are small, ~15 lines each).

The component body:

```tsx
export function PinnedParticleEffect({
  config,
  geoWidth,
  geoHeight,
  viewportRef,
}: PinnedParticleEffectProps) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const positionAttributeRef = useRef<BufferAttribute>(null);
  const alphaAttributeRef = useRef<BufferAttribute>(null);
  const sizeAttributeRef = useRef<BufferAttribute>(null);
  const particlesRef = useRef<ParticleInstance[]>([]);
  const [texture, setTexture] = useState<Texture | null>(null);

  const maxCount = Math.max(0, Math.floor(config.maxCount ?? 50));
  const mode = config.mode ?? "twinkle";
  const opacity = config.opacity ?? 1;
  const localZOffset = config.localZOffset ?? 0.002;
  const maskSampler = useMaskSampler(config.maskSrc);
  const maskChannel = config.maskChannel ?? "r";
  const maskBehavior = config.maskBehavior ?? "spawn";
  const maskThreshold = config.maskThreshold ?? 0.1;

  // Texture loading (same as ParticleEffect)
  useEffect(() => {
    if (!config.src) { setTexture(null); return; }
    const loader = new TextureLoader();
    let disposed = false;
    let loadedTexture: Texture | null = null;
    loader.load(config.src, (tex) => {
      if (disposed) { tex.dispose(); return; }
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      loadedTexture = tex;
      setTexture(tex);
    }, undefined, () => { if (!disposed) setTexture(null); });
    return () => { disposed = true; if (loadedTexture) loadedTexture.dispose(); };
  }, [config.src]);

  const positionArray = useMemo(() => new Float32Array(maxCount * 3), [maxCount]);
  const alphaArray = useMemo(() => new Float32Array(maxCount), [maxCount]);
  const sizeArray = useMemo(() => new Float32Array(maxCount), [maxCount]);

  // Build a ParticleEffectConfig-compatible object for the existing particle utility functions
  // This avoids duplicating the particle init/update logic
  const particleUtilConfig = useMemo(() => ({
    id: config.id,
    mode: config.mode,
    maxCount: config.maxCount,
    color: config.color,
    size: config.size,
    sizeVariance: config.sizeVariance,
    twinkleDuration: config.twinkleDuration,
    twinkleDurationVariance: config.twinkleDurationVariance,
    driftDirection: config.driftDirection,
    driftDirectionVariance: config.driftDirectionVariance,
    driftSpeed: config.driftSpeed,
    driftSpeedVariance: config.driftSpeedVariance,
    driftDistance: config.driftDistance,
  }), [
    config.id, config.mode, config.maxCount, config.color,
    config.size, config.sizeVariance, config.twinkleDuration,
    config.twinkleDurationVariance, config.driftDirection,
    config.driftDirectionVariance, config.driftSpeed,
    config.driftSpeedVariance, config.driftDistance,
  ]);

  // Initialize particles using layer-local dimensions
  useEffect(() => {
    if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
      particlesRef.current = initializeMaskedParticles(
        particleUtilConfig, geoWidth, geoHeight, maxCount,
        maskSampler, maskChannel, maskThreshold
      );
      return;
    }
    particlesRef.current = initializeParticles(particleUtilConfig, geoWidth, geoHeight, maxCount);
  }, [geoWidth, geoHeight, maxCount, maskBehavior, maskChannel, maskSampler, maskThreshold, particleUtilConfig]);

  const uniforms = useMemo(() => {
    const base: Record<string, { value: unknown }> = {
      uColor: { value: new Color(config.color ?? "#ffffff") },
      uOpacity: { value: opacity },
    };
    if (texture) base.uTexture = { value: texture };
    return base;
  }, [config.color, opacity, texture]);

  useFrame((_, delta) => {
    const cappedDelta = Math.min(delta, 0.1);
    const particles = particlesRef.current;

    if (materialRef.current) {
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniforms.uColor.value.set(config.color ?? "#ffffff");
      if (texture && materialRef.current.uniforms.uTexture) {
        materialRef.current.uniforms.uTexture.value = texture;
      }
    }

    for (let i = 0; i < maxCount; i++) {
      let particle = particles[i];
      if (!particle) {
        particle = maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")
          ? createMaskedParticle(particleUtilConfig, geoWidth, geoHeight, maskSampler, maskChannel, maskThreshold)
          : initializeParticles(particleUtilConfig, geoWidth, geoHeight, 1)[0];
        particles[i] = particle;
      }

      if (mode === "drift") {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedDriftParticle(particle, cappedDelta, particleUtilConfig, geoWidth, geoHeight, maskSampler, maskChannel, maskThreshold);
        } else {
          updateDriftParticle(particle, cappedDelta, particleUtilConfig, geoWidth, geoHeight);
        }
      } else {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedTwinkleParticle(particle, cappedDelta, geoWidth, geoHeight, maskSampler, maskChannel, maskThreshold);
        } else {
          updateTwinkleParticle(particle, cappedDelta, geoWidth, geoHeight);
        }
      }

      // Wrap within layer-local bounds
      particle.x = ((particle.x % geoWidth) + geoWidth) % geoWidth;
      particle.y = ((particle.y % geoHeight) + geoHeight) % geoHeight;

      // Convert to layer-local centered coordinates
      // The parent mesh is centered at (0,0), geometry extends from -geoWidth/2 to +geoWidth/2
      const localX = particle.x - geoWidth / 2;
      const localY = geoHeight / 2 - particle.y;
      const offset = i * 3;

      positionArray[offset] = localX;
      positionArray[offset + 1] = localY;
      positionArray[offset + 2] = 0;
      alphaArray[i] = particle.alpha;
      sizeArray[i] = particle.size;
    }

    if (positionAttributeRef.current) positionAttributeRef.current.needsUpdate = true;
    if (alphaAttributeRef.current) alphaAttributeRef.current.needsUpdate = true;
    if (sizeAttributeRef.current) sizeAttributeRef.current.needsUpdate = true;

    // NO position/scale logic — parent mesh handles it
  });

  // Render at local z-offset within parent mesh
  return (
    <points ref={pointsRef} position={[0, 0, localZOffset]}>
      <bufferGeometry>
        <bufferAttribute ref={positionAttributeRef} attach="attributes-position" args={[positionArray, 3]} />
        <bufferAttribute ref={alphaAttributeRef} attach="attributes-alpha" args={[alphaArray, 1]} />
        <bufferAttribute ref={sizeAttributeRef} attach="attributes-particleSize" args={[sizeArray, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={texture ? FRAGMENT_SHADER_TEXTURE : FRAGMENT_SHADER_CIRCLE}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
```

**Key differences from standalone `ParticleEffect`:**
- No `parallaxFactor`, `parallaxMode`, `baseWidth`, `baseHeight`, `layerOffset` props
- Uses `geoWidth`/`geoHeight` (parent layer geometry) as the particle region
- Particle positions are in **layer-local centered coordinates** (centered at 0,0 matching the parent mesh's geometry origin)
- No pan offset or parallax scale computation in `useFrame` — parent handles it
- No `resolveParticleRegion` — particles always fill the layer's geometry bounds
- Positioned at local `(0, 0, localZOffset)`

**Regarding the particle shaders (`VERTEX_SHADER`, `FRAGMENT_SHADER_CIRCLE`, `FRAGMENT_SHADER_TEXTURE`):**

Extract these three constants from `ParticleEffect.tsx` into a new shared file:

**File:** `packages/interactive-map/src/utils/particleShaders.ts` (new file)

```ts
export const PARTICLE_VERTEX_SHADER = `
attribute float alpha;
attribute float particleSize;
varying float vAlpha;

uniform float uOpacity;

void main() {
  vAlpha = alpha * uOpacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = particleSize;
}
`;

export const PARTICLE_FRAGMENT_SHADER_CIRCLE = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  if (dot(center, center) > 0.25) discard;
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

export const PARTICLE_FRAGMENT_SHADER_TEXTURE = `
uniform vec3 uColor;
uniform sampler2D uTexture;
varying float vAlpha;

void main() {
  vec4 texColor = texture2D(uTexture, gl_PointCoord);
  gl_FragColor = vec4(uColor * texColor.rgb, texColor.a * vAlpha);
}
`;
```

Then update `ParticleEffect.tsx` to import from `../utils/particleShaders` instead of having inline constants. Update the references from `VERTEX_SHADER` → `PARTICLE_VERTEX_SHADER`, `FRAGMENT_SHADER_CIRCLE` → `PARTICLE_FRAGMENT_SHADER_CIRCLE`, `FRAGMENT_SHADER_TEXTURE` → `PARTICLE_FRAGMENT_SHADER_TEXTURE`.

`PinnedParticleEffect.tsx` imports from the same shared file.

## Step 5: Update `MapLayerMesh` to Accept Pinned Effects

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

### 5a. Add new props

Add to `MapLayerMeshProps`:

```ts
import type { PinnedEffects } from "../types";
// ... (add to imports)

interface MapLayerMeshProps {
  // ... existing props ...
  /** Pinned effects to render as children of this layer's mesh */
  pinnedEffects?: PinnedEffects;
}
```

### 5b. Render pinned effects as children of both main mesh and carousel clone

Update the JSX return of `MapLayerMesh`. The pinned effects are rendered **inside** each `<mesh>` element so they become scene graph children and inherit transforms.

**Main mesh — before:**
```tsx
<mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
  <planeGeometry args={[geoWidth, geoHeight]} />
  {shaderConfig && shaderUniforms ? (
    <shaderMaterial ... />
  ) : (
    <meshBasicMaterial map={processedTexture} transparent />
  )}
</mesh>
```

**Main mesh — after:**
```tsx
<mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
  <planeGeometry args={[geoWidth, geoHeight]} />
  {shaderConfig && shaderUniforms ? (
    <shaderMaterial ... />
  ) : (
    <meshBasicMaterial map={processedTexture} transparent />
  )}
  {pinnedEffects?.shaderEffects.map((effect) => (
    <PinnedShaderEffect
      key={effect.id}
      config={effect}
      geoWidth={geoWidth}
      geoHeight={geoHeight}
      viewportRef={viewportRef}
    />
  ))}
  {pinnedEffects?.particleEffects.map((effect) => (
    <PinnedParticleEffect
      key={effect.id}
      config={effect}
      geoWidth={geoWidth}
      geoHeight={geoHeight}
      viewportRef={viewportRef}
    />
  ))}
</mesh>
```

**Carousel clone mesh — same pattern:**

Apply the identical pinned effect children inside the clone `<mesh>` element (the one with `ref={cloneRef}`). This ensures pinned effects are visible on both the original and the seamlessly-tiled clone during carousel animation.

### 5c. Add imports

```ts
import { PinnedShaderEffect } from "./PinnedShaderEffect";
import { PinnedParticleEffect } from "./PinnedParticleEffect";
import type { PinnedEffects } from "../types";
```

## Step 6: Update `MapScene` to Route Pinned Effects to Layers

**File:** `packages/interactive-map/src/components/MapScene.tsx`

### 6a. Update resolved mask effects to include pinned map

Change the `resolvedMaskEffects` useMemo — it now returns `pinnedEffects` too:

```ts
const resolvedMaskEffects = useMemo(() => {
  if (!maskEffects || maskEffects.length === 0) {
    return { shaderEffects: [], particleEffects: [], pinnedEffects: new Map() };
  }
  return resolveAllMaskEffects(maskEffects);
}, [maskEffects]);
```

### 6b. Pass pinned effects to each `MapLayerMesh`

In the `sortedLayers.map(...)` block, look up pinned effects for each layer and pass them:

```tsx
{sortedLayers.map((layer) => {
  // ... existing parallaxFactor computation ...
  const layerPinnedEffects = resolvedMaskEffects.pinnedEffects.get(layer.id);

  return (
    <MapLayerMesh
      key={layer.id}
      src={layer.src}
      zIndex={layer.zIndex}
      position={layer.position}
      animation={animation}
      shaderConfig={layer.shaderConfig}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
      baseFrustumHalfWidth={baseFrustumHalfWidth}
      baseFrustumHalfHeight={baseFrustumHalfHeight}
      minZoom={zoomConfig.minZoom}
      maxZoom={zoomConfig.maxZoom}
      parallaxFactor={parallaxFactor}
      parallaxMode={parallaxConfig?.mode}
      viewportRef={viewportRef}
      pinnedEffects={layerPinnedEffects}
    />
  );
})}
```

## Step 7: Update Barrel Exports

**File:** `packages/interactive-map/src/index.ts`

### 7a. Export new types

Add to the existing type export block:

```ts
export type {
  // ... existing exports ...
  PinnedShaderEffectConfig,
  PinnedParticleEffectConfig,
  PinnedEffects,
  // ...
} from "./types";
```

### 7b. Export new components (optional, for advanced usage)

```ts
export { PinnedShaderEffect } from "./components/PinnedShaderEffect";
export { PinnedParticleEffect } from "./components/PinnedParticleEffect";
```

### 7c. Export shared particle shaders (optional)

```ts
export {
  PARTICLE_VERTEX_SHADER,
  PARTICLE_FRAGMENT_SHADER_CIRCLE,
  PARTICLE_FRAGMENT_SHADER_TEXTURE,
} from "./utils/particleShaders";
```

## Step 8: Update Demo to Showcase Pinned Mask Effects

**File:** `apps/demo/src/app/page.tsx`

Add a pinned mask effect example alongside any existing `maskEffects`. For example, if there's a layer with `id: "terrain"`:

```tsx
maskEffects={[
  // Existing standalone mask effects (from Chunk 8c) ...

  // New: pinned mask effects (Chunk 8d)
  {
    id: "terrain-pinned-effects",
    src: "/maps/demo-mask.png",
    pinnedTo: "terrain",  // <-- pins to the "terrain" layer
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
    maskBehavior: "both",
  },
]}
```

Use whichever layer ID exists in the demo. The key thing to demonstrate: when panning/zooming with parallax enabled (or carousel if applicable), the pinned effects move **exactly** with the layer — no drift.

## Step 9: Verify Behavior

No code changes — verification during testing:

1. **Parallax sync:** Pan the map with parallax enabled. Pinned effects must move at exactly the same rate as the pinned layer. No drift or 1-frame lag.
2. **Depth-mode zoom:** Zoom in/out in depth mode. Pinned effects must scale identically with the layer.
3. **Drift-mode zoom:** Zoom in/out in drift mode. Pinned effects must offset identically with the layer.
4. **Carousel:** If the pinned layer has a carousel animation, the effects must tile/wrap identically (visible on both main mesh and clone).
5. **Layer animations:** If the pinned layer has bounce/wobble/fade animations, effects must follow.
6. **Standalone coexistence:** Standalone (non-pinned) mask effects, shader effects, and particle effects still work independently.
7. **Invalid pinnedTo:** If `pinnedTo` references a non-existent layer ID, effects are silently ignored (no crash). The resolver produces pinned entries but `MapScene` finds no matching layer, so nothing renders.
8. **Build:** `pnpm build` succeeds with no errors.

# Acceptance Criteria

1. `MaskEffectConfig` has an optional `pinnedTo` field (layer ID string).
2. `PinnedShaderEffectConfig` and `PinnedParticleEffectConfig` types are defined and exported.
3. `PinnedEffects` aggregate type is defined and exported.
4. `resolveMaskEffects()` routes channel effects to pinned configs when `pinnedTo` is set.
5. `resolveAllMaskEffects()` returns a `pinnedEffects` map keyed by layer ID.
6. `PinnedShaderEffect` component renders as a child mesh with no position/parallax logic.
7. `PinnedParticleEffect` component renders as a child points with layer-local particle coordinates.
8. Particle shaders are extracted to `utils/particleShaders.ts` and shared between `ParticleEffect` and `PinnedParticleEffect`.
9. `MapLayerMesh` accepts optional `pinnedEffects` prop and renders them inside both the main mesh and carousel clone mesh.
10. `MapScene` looks up pinned effects per layer and passes them to `MapLayerMesh`.
11. Pinned effects inherit parallax, pan, zoom scaling, carousel, and layer animations via Three.js scene graph.
12. Standalone (non-pinned) mask effects continue to work as before.
13. Demo showcases a pinned mask effect on a layer.
14. The app builds without errors (`pnpm build`).

# Log

- **2026-02-19 (Created):** Initial plan for Chunk 8d — Layer-Pinned Mask Effects. Adds `pinnedTo` field to `MaskEffectConfig` that pins effects to a map layer via Three.js parent-child scene graph. Creates `PinnedShaderEffect` and `PinnedParticleEffect` lightweight components that skip position/parallax logic (inherited from parent). Updates `MapLayerMesh` to render pinned effects as children of the layer mesh (including carousel clone). Updates resolver to partition effects into standalone vs pinned. Extracts shared particle shaders to a utility file.
