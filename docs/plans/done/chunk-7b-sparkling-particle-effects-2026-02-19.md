---
Name: Chunk 7b — Sparkling / Particle Effects
Type: Feature
Created On: 2026-02-19
Modified On: 2026-02-19
---

# Brief
Add a particle effect system to `InteractiveMap` that renders configurable sparkle/particle effects on the map using Three.js `Points` + `BufferGeometry` for efficient GPU-based rendering. The system supports two visual modes — **twinkle** (stationary particles that fade in/out at random positions) and **drift** (particles that move in a configurable direction while fading out). Particles can be confined to a rectangular region or cover the full map. An optional `layerId` attachment lets particles inherit a layer's base position and parallax factor. Rendering supports both solid color points and optional PNG textures for richer visuals.

# Plan & Instruction

## Step 1: Define Types

File: `packages/interactive-map/src/types/index.ts`

Add the following types **after** the `FogEffectConfig` interface and **before** `InteractiveMapProps`:

```ts
export interface ParticleEffectConfig {
  /** Unique ID for this particle effect */
  id: string;
  /**
   * Visual mode:
   * - 'twinkle': particles appear at random positions, fade in/out, then reappear elsewhere (stationary).
   * - 'drift': particles spawn at random positions, move in a direction while fading out, then respawn.
   * Default: 'twinkle'
   */
  mode?: "twinkle" | "drift";
  /** Maximum number of particles. Default: 50 */
  maxCount?: number;
  /** Particle color as a CSS color string (hex, rgb, etc.). Default: "#ffffff" */
  color?: string;
  /** Base particle size in pixels. Default: 3 */
  size?: number;
  /** Random size variance factor (0–1). Each particle gets size * (1 ± sizeVariance). Default: 0.3 */
  sizeVariance?: number;
  /**
   * Optional PNG texture for particles (e.g., a star/sparkle image).
   * If provided, each particle renders this texture instead of a plain dot.
   * If omitted, particles render as solid colored circles.
   */
  src?: string;
  /**
   * Optional rectangular region in base image pixel coordinates where particles spawn.
   * If omitted, particles cover the entire map (0, 0, baseWidth, baseHeight).
   */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Optional layer ID to attach this particle effect to.
   * When set, particles inherit the layer's base position offset and parallax factor.
   * The region (if provided) is relative to the layer's position.
   */
  layerId?: string;

  // --- Twinkle mode options ---
  /** Duration of one twinkle cycle (fade in → hold → fade out) in seconds. Default: 2 */
  twinkleDuration?: number;
  /** Random duration variance factor (0–1). Default: 0.5 */
  twinkleDurationVariance?: number;

  // --- Drift mode options ---
  /** Drift direction as a normalized vector. Default: { x: 0, y: 1 } (upward in world space) */
  driftDirection?: { x: number; y: number };
  /** Random angle variance in degrees applied per-particle. Default: 15 */
  driftDirectionVariance?: number;
  /** Drift speed in pixels per second. Default: 30 */
  driftSpeed?: number;
  /** Random speed variance factor (0–1). Default: 0.3 */
  driftSpeedVariance?: number;
  /** How far a particle drifts (in pixels) before it fades out and respawns. Default: 100 */
  driftDistance?: number;

  /** zIndex for depth ordering (same system as MapLayer). Default: 11 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this particle effect.
   * Only used when parallaxConfig is provided on the map AND layerId is NOT set.
   * If layerId is set, the attached layer's parallax factor is used instead.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /** Base opacity multiplier for all particles (0–1). Default: 1 */
  opacity?: number;
}
```

Add `particleEffects` to `InteractiveMapProps`:

```ts
export interface InteractiveMapProps {
  // ... existing props ...
  /** Array of particle effect configurations (sparkles, embers, fairy dust, etc.) */
  particleEffects?: ParticleEffectConfig[];
}
```

## Step 2: Create Particle Math Utility

File: `packages/interactive-map/src/utils/particles.ts` (new file)

This utility contains pure math/data functions for particle lifecycle management. Keeping these pure is consistent with the existing `animation.ts`, `spriteInstances.ts`, and `fog.ts` pattern.

### Data structure

```ts
export interface ParticleInstance {
  /** Position within the region (local coords, origin = region top-left) */
  x: number;
  y: number;
  /** Per-particle size (base size with variance applied) */
  size: number;
  /** Current alpha (0–1), computed each frame */
  alpha: number;
  /** Phase offset (0–1) so particles don't all sync */
  phase: number;
  /** Twinkle: cycle duration for this particle (with variance) */
  cycleDuration: number;
  /** Drift: direction vector (normalized, with per-instance variance) */
  dx: number;
  dy: number;
  /** Drift: speed in px/sec (with variance) */
  speed: number;
  /** Drift: total distance traveled so far */
  distanceTraveled: number;
  /** Drift: max distance before respawn */
  maxDistance: number;
  /** Elapsed time accumulator for this particle */
  elapsed: number;
}
```

### Functions

#### `createParticle(config, regionWidth, regionHeight): ParticleInstance`

Creates a single particle with randomized properties.

- **Position**: Random `x` in `[0, regionWidth]`, random `y` in `[0, regionHeight]`.
- **Size**: `baseSize * (1 + (Math.random() * 2 - 1) * sizeVariance)`. Clamp to minimum of 0.5.
- **Phase**: Random value in `[0, 1]` so particles start at different points in their cycle.
- **Twinkle fields**:
  - `cycleDuration = twinkleDuration * (1 + (Math.random() * 2 - 1) * twinkleDurationVariance)`. Clamp to minimum of 0.1.
- **Drift fields**:
  - Normalize `driftDirection`. Apply `driftDirectionVariance` as random rotation in degrees.
  - `speed = driftSpeed * (1 + (Math.random() * 2 - 1) * driftSpeedVariance)`.
  - `distanceTraveled = 0`.
  - `maxDistance = driftDistance`.
- `elapsed = 0`, `alpha = 0`.

#### `initializeParticles(config, regionWidth, regionHeight, count): ParticleInstance[]`

Creates `count` particles. To avoid a simultaneous burst, stagger their phase:
- For twinkle mode: each particle starts with `elapsed = phase * cycleDuration` (pre-advance through cycle).
- For drift mode: each particle starts with `distanceTraveled = phase * maxDistance` (pre-advance through drift), and position is offset accordingly along its direction.

#### `updateTwinkleParticle(particle, delta): void`

Updates a single particle in twinkle mode:
- Advance `elapsed` by `delta`.
- Compute cycle progress: `t = (elapsed % cycleDuration) / cycleDuration`.
- Alpha follows a smooth bell curve: `alpha = sin(t * PI)`. This gives a natural fade-in → peak → fade-out.
- When a full cycle completes (`elapsed >= cycleDuration`): reset `elapsed -= cycleDuration` and randomize position within region.

#### `updateDriftParticle(particle, delta, config, regionWidth, regionHeight): void`

Updates a single particle in drift mode:
- Move: `x += dx * speed * delta`, `y += dy * speed * delta`.
- `distanceTraveled += speed * delta`.
- Compute alpha: fade out as the particle approaches `maxDistance`. `alpha = 1 - (distanceTraveled / maxDistance)`. Clamp to `[0, 1]`.
- When `distanceTraveled >= maxDistance`: respawn — reset position to random within region, reset `distanceTraveled = 0`, re-randomize direction (with variance) and speed (with variance).

## Step 3: Create `ParticleEffect` Component

File: `packages/interactive-map/src/components/ParticleEffect.tsx` (new file)

This is a React Three Fiber component that renders one particle effect group using `THREE.Points` + `THREE.BufferGeometry`.

### Props

```ts
interface ParticleEffectProps {
  config: ParticleEffectConfig;
  baseWidth: number;
  baseHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  /** Offset from the attached layer's position (0,0 if no layer attachment) */
  layerOffset: { x: number; y: number };
}
```

### Implementation approach

1. **Resolve region**: If `config.region` is provided, use it. Otherwise, use `{ x: 0, y: 0, width: baseWidth, height: baseHeight }`.

2. **Load optional texture**: If `config.src` is provided, load with `useLoader(TextureLoader, config.src)`. Set `colorSpace = SRGBColorSpace`.

3. **Initialize particles**: Use `useRef` to store a mutable array of `ParticleInstance`. Initialize with `initializeParticles()`.

4. **Create BufferGeometry attributes** (via `useMemo`):
   - `position`: `Float32BufferAttribute(maxCount * 3)` — x, y, z for each particle.
   - `alpha`: `Float32BufferAttribute(maxCount)` — per-particle opacity.
   - `size`: `Float32BufferAttribute(maxCount)` — per-particle size.
   - Store refs to these attributes for direct mutation in `useFrame`.

5. **PointsMaterial setup**:
   - `color`: `new THREE.Color(config.color ?? "#ffffff")`.
   - `transparent: true`.
   - `depthWrite: false` (particles are additive-like, should not occlude each other).
   - `sizeAttenuation: false` (particle size in screen pixels, not affected by camera zoom — consistent visual).
   - `map`: the loaded texture if provided, otherwise `null`.
   - `blending: THREE.AdditiveBlending` — sparkles look best with additive blending (bright, luminous).
   - **Custom `onBeforeCompile`** to inject per-particle alpha: Three.js `PointsMaterial` doesn't natively support per-vertex alpha. Use `onBeforeCompile` to modify the shader:
     - Add `attribute float alpha;` and `varying float vAlpha;` to the vertex shader.
     - Pass `vAlpha = alpha;` in the vertex shader.
     - In the fragment shader, multiply `gl_FragColor.a *= vAlpha;`.
   - Alternatively, use a minimal `ShaderMaterial` with a simple vertex/fragment shader. **Decision: use `ShaderMaterial`** for cleaner per-particle alpha support. This avoids fragile `onBeforeCompile` hacks.

6. **ShaderMaterial** (inline, no external file):

   Vertex shader:
   ```glsl
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
   ```

   Fragment shader (no texture):
   ```glsl
   uniform vec3 uColor;
   varying float vAlpha;

   void main() {
     // Circle shape: discard pixels outside radius
     vec2 center = gl_PointCoord - vec2(0.5);
     if (dot(center, center) > 0.25) discard;
     gl_FragColor = vec4(uColor, vAlpha);
   }
   ```

   Fragment shader (with texture):
   ```glsl
   uniform vec3 uColor;
   uniform sampler2D uTexture;
   varying float vAlpha;

   void main() {
     vec4 texColor = texture2D(uTexture, gl_PointCoord);
     gl_FragColor = vec4(uColor * texColor.rgb, texColor.a * vAlpha);
   }
   ```

   **Implementation note**: Use a single fragment shader with a `uniform bool uUseTexture;` flag, or conditionally create the material based on whether `config.src` is provided. **Decision: conditionally create the material** (simpler, no branching in shader).

   Uniforms:
   - `uColor`: `new THREE.Color(config.color ?? "#ffffff")`
   - `uOpacity`: `config.opacity ?? 1`
   - `uTexture`: the loaded texture (only when `src` is provided)

7. **`useFrame` loop** (cap delta at 0.1):
   - Loop through all particle instances.
   - Call `updateTwinkleParticle()` or `updateDriftParticle()` based on mode.
   - Convert particle local position to world position:
     - `worldX = region.x + particle.x - baseWidth / 2 + layerOffset.x`
     - `worldY = baseHeight / 2 - (region.y + particle.y) + layerOffset.y`
   - Write to the `position` attribute buffer: `[worldX, worldY, zIndex * 0.01]`.
   - Write to the `alpha` attribute buffer: `particle.alpha`.
   - Write to the `size` attribute buffer: `particle.size`.
   - After the loop, set `positionAttribute.needsUpdate = true`, `alphaAttribute.needsUpdate = true`, `sizeAttribute.needsUpdate = true`.

8. **Parallax**: Apply parallax to the `<points>` group position (same pattern as other effects):
   - Pan offset: `viewport.x * (1 - parallaxFactor)`, `viewport.y * (1 - parallaxFactor)`.
   - Drift mode: additional zoom-based positional offset.
   - Depth mode: scale the points group.

9. **Blending**: Set `THREE.AdditiveBlending` on the material for a glowing sparkle look.

10. **Z-positioning**: The `<points>` group position z = `(config.zIndex ?? 11) * 0.01`.

### Component JSX structure

```tsx
return (
  <points ref={pointsRef} position={[0, 0, (config.zIndex ?? 11) * 0.01]}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" {...positionAttr} />
      <bufferAttribute attach="attributes-alpha" {...alphaAttr} />
      <bufferAttribute attach="attributes-particleSize" {...sizeAttr} />
    </bufferGeometry>
    <shaderMaterial
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      transparent
      depthWrite={false}
      blending={THREE.AdditiveBlending}
    />
  </points>
);
```

## Step 4: Integrate into `MapScene`

File: `packages/interactive-map/src/components/MapScene.tsx`

### Changes

1. Import `ParticleEffect` component and `ParticleEffectConfig` type.
2. Add `particleEffects?: ParticleEffectConfig[]` to `MapSceneProps`.
3. Render particle effects after fog effects but before sprite effects. Particles (sparkles) are typically mid-ground overlays.

Add this block after the `fogEffects` section and before the `spriteEffects` section:

```tsx
{(particleEffects ?? []).map((particle) => {
  // Resolve layer attachment
  const attachedLayer = particle.layerId
    ? layers.find((l) => l.id === particle.layerId)
    : undefined;

  const layerOffset = attachedLayer
    ? { x: attachedLayer.position?.x ?? 0, y: attachedLayer.position?.y ?? 0 }
    : { x: 0, y: 0 };

  // Parallax: if attached to a layer, use the layer's parallax factor
  let effectParallaxFactor: number;
  if (attachedLayer && parallaxConfig) {
    const isBase = attachedLayer.id === baseLayerId;
    effectParallaxFactor = isBase
      ? 1
      : computeParallaxFactor(
          attachedLayer,
          baseLayerZIndex,
          parallaxConfig.intensity
        );
  } else if (!parallaxConfig || particle.parallaxFactor !== undefined) {
    effectParallaxFactor = particle.parallaxFactor ?? 1;
  } else {
    effectParallaxFactor = computeParallaxFactor(
      {
        id: particle.id,
        src: "",
        zIndex: particle.zIndex ?? 11,
        parallaxFactor: particle.parallaxFactor,
      },
      baseLayerZIndex,
      parallaxConfig.intensity
    );
  }

  return (
    <ParticleEffect
      key={particle.id}
      config={particle}
      baseWidth={baseWidth}
      baseHeight={baseHeight}
      parallaxFactor={effectParallaxFactor}
      parallaxMode={parallaxConfig?.mode}
      viewportRef={viewportRef}
      layerOffset={layerOffset}
    />
  );
})}
```

## Step 5: Wire Through `InteractiveMap`

File: `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Accept `particleEffects` from `InteractiveMapProps`.
2. Pass `particleEffects` down to `MapScene`.

## Step 6: Update Barrel Exports

File: `packages/interactive-map/src/index.ts`

Export the new type:
- `ParticleEffectConfig`

No need to export the `ParticleEffect` component (it's internal).

## Step 7: Add Demo

File: `apps/demo/src/app/page.tsx`

Add a `particleEffects` config to the demo `InteractiveMap` usage. Add two particle effects to demonstrate both modes:

```tsx
particleEffects={[
  {
    id: "sparkles",
    mode: "twinkle",
    maxCount: 40,
    color: "#FFD700",
    size: 4,
    sizeVariance: 0.5,
    twinkleDuration: 2,
    twinkleDurationVariance: 0.6,
    region: { x: 600, y: 400, width: 800, height: 600 },
    zIndex: 11,
    opacity: 0.9,
  },
  {
    id: "embers",
    mode: "drift",
    maxCount: 20,
    color: "#FF6B35",
    size: 3,
    sizeVariance: 0.4,
    driftDirection: { x: 0.1, y: 1 },
    driftDirectionVariance: 20,
    driftSpeed: 25,
    driftSpeedVariance: 0.3,
    driftDistance: 120,
    region: { x: 1600, y: 800, width: 600, height: 400 },
    zIndex: 11,
    opacity: 0.8,
  },
]}
```

**Note:** No texture asset is needed for the demo — both effects use color-based rendering. If a sparkle texture PNG is available, it can be added via the `src` prop.

# Acceptance Criteria

1. `particleEffects` prop is accepted by `InteractiveMap` and typed as `ParticleEffectConfig[]`.
2. Particles render on the map canvas using `THREE.Points` + `BufferGeometry` (GPU-efficient).
3. **Twinkle mode**: particles appear at random positions within the region, smoothly fade in and out, then reappear at new random positions.
4. **Drift mode**: particles spawn at random positions, move in the configured direction while fading out, then respawn.
5. Particles are confined to the configured `region` (if provided) or cover the full map (if omitted).
6. Multiple particle effects can coexist with different modes, colors, regions, and depths.
7. `layerId` attachment works: particles inherit the attached layer's base position offset and parallax factor.
8. Color-based rendering works with configurable `color` and `size`.
9. Texture-based rendering works when `src` is provided (particles render the PNG instead of solid circles).
10. `sizeVariance` produces non-uniform particle sizes for organic look.
11. `twinkleDurationVariance` and `driftSpeedVariance` / `driftDirectionVariance` produce non-uniform timing and movement.
12. Particles use `AdditiveBlending` for a glowing sparkle appearance.
13. Particles participate in parallax when `parallaxConfig` is provided (both depth and drift modes).
14. Initial load staggers particles across their lifecycle (no simultaneous burst on first frame).
15. Performance: particles use direct `BufferAttribute` mutation in `useFrame` (zero React re-renders), consistent with existing animation patterns.
16. Custom `ShaderMaterial` supports per-particle alpha without `onBeforeCompile` hacks.
17. Demo app shows both twinkle and drift particle effects in action.

# Log

- **2026-02-19 (Created):** Initial plan for sparkling/particle effect system. Covers types (`ParticleEffectConfig`), particle math utility (`utils/particles.ts`) with twinkle and drift modes, `ParticleEffect` component using `THREE.Points` + `BufferGeometry` + custom `ShaderMaterial` for per-particle alpha, optional texture support, configurable regions, layer attachment (position + parallax inheritance), `AdditiveBlending`, MapScene/InteractiveMap wiring, barrel exports, and demo with both modes.
