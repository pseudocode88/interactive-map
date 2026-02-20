# @interactive-map/core

Reusable interactive map component for React apps using Three.js via React Three Fiber.

## Install

```bash
pnpm add @interactive-map/core three @react-three/fiber @react-three/drei
```

Peer dependencies:
- `react` 18 or 19
- `react-dom` 18 or 19

## What It Supports

- Multi-layer map rendering from image assets
- Pan + zoom with clamped camera bounds
- Per-layer animations (`bounce`, `carousel`, `fade`, `wobble`)
- Optional parallax depth behavior
- Markers, sprites, fog, particles
- Standalone shader effects and mask-driven effects
- Loading overlay customization and render tuning

## `InteractiveMap` Props

### `layers: MapLayer[]` (required)
All map image layers. Lowest `zIndex` is used as the base layer unless `baseLayerId` is provided.

### `baseLayerId?: string`
Layer ID to use as viewport reference instead of lowest `zIndex`.

### `width?: string`
Container width. Default: `"100%"`.

### `height?: string`
Container height. Default: `"100%"`.

### `className?: string`
Optional container class.

### `panConfig?: PanConfig`
Panning behavior settings.

### `zoomConfig?: ZoomConfig`
Zoom behavior settings.

### `parallaxConfig?: ParallaxConfig`
Enables map parallax when provided.

### `markers?: MapMarker[]`
Clickable marker points.

### `spriteEffects?: SpriteEffectConfig[]`
Sprite-sheet based effects (birds, butterflies, etc).

### `fogEffects?: FogEffectConfig[]`
Fog/drift overlays.

### `particleEffects?: ParticleEffectConfig[]`
Twinkle/drift/glow particles.

### `shaderEffects?: ShaderEffectConfig[]`
Standalone shader quads.

### `maskEffects?: MaskEffectConfig[]`
Mask-channel driven shader/particle groups.

### `onMarkerClick?: (markerId: string) => void`
Marker click callback.

### `loadingMessages?: string[]`
Custom loading overlay milestone text.

### `loadingStyle?: LoadingStyleConfig`
Loading overlay style overrides.

### `showLoadingScreen?: boolean`
Controls loading overlay visibility. Default: `true`.

### `renderConfig?: RenderConfig`
Renderer performance tuning options.

### `blockOnParticleInit?: boolean`
When `false`, particle initialization continues after first reveal. Default: `true`.

### `resetZoomTrigger?: number`
Increment/change this value to reset pan/zoom to initial state.

Small snippet:

```tsx
<InteractiveMap
  layers={layers}
  panConfig={{ enabled: true }}
  zoomConfig={{ minZoom: 1, maxZoom: 2.2 }}
  parallaxConfig={{ intensity: 0.3 }}
  renderConfig={{ dpr: [1, 1.5], antialias: false }}
/>
```

## Config Categories

### `MapLayer`
Properties:
- `id: string` unique layer ID
- `src: string` image path/url
- `zIndex: number` depth order
- `position?: { x?: number; y?: number }` pixel offset
- `animation?: LayerAnimation | LayerAnimation[]` one or many parallel animations
- `parallaxFactor?: number` per-layer parallax override
- `shaderConfig?: LayerShaderConfig` custom layer shader behavior

Small snippet:

```ts
const baseLayer: MapLayer = {
  id: "base",
  src: "/base-map.webp",
  zIndex: 0,
  position: { x: 0, y: 0 },
};
```

### `PanConfig`
Properties:
- `enabled?: boolean` enable/disable panning
- `easingFactor?: number` pan smoothing factor
- `focusEasingFactor?: number` smoothing for programmatic focus/reset moves

Small snippet:

```ts
const panConfig: PanConfig = { enabled: true, easingFactor: 0.15, focusEasingFactor: 0.05 };
```

### `ZoomConfig`
Properties:
- `enabled?: boolean` enable/disable zoom
- `minZoom?: number` minimum zoom level
- `maxZoom?: number` maximum zoom level
- `initialZoom?: number` starting zoom
- `animateIntroZoom?: boolean` start at `minZoom` then animate to `initialZoom`
- `introZoomDelayMs?: number` delay before intro zoom starts
- `scrollSpeed?: number` wheel/pinch sensitivity
- `easingFactor?: number` zoom smoothing factor
- `focusEasingFactor?: number` smoothing for programmatic focus/reset zoom

Small snippet:

```ts
const zoomConfig: ZoomConfig = {
  enabled: true,
  minZoom: 1,
  maxZoom: 2.5,
  initialZoom: 1.3,
  animateIntroZoom: true,
};
```

### `ParallaxConfig`
Properties:
- `intensity?: number` global parallax multiplier
- `mode?: "depth" | "drift"` depth-scaling vs drift-style behavior

Small snippet:

```ts
const parallaxConfig: ParallaxConfig = { intensity: 0.35, mode: "depth" };
```

### `MapMarker`
Properties:
- `x: number` X in base-image pixels
- `y: number` Y in base-image pixels
- `id: string` marker ID
- `label: string` tooltip text
- `color?: string` marker color

Small snippet:

```ts
const markers: MapMarker[] = [{ id: "a", x: 840, y: 420, label: "Olympus", color: "#ff7a59" }];
```

### `SpriteEffectConfig`
Properties:
- `id: string` unique effect ID
- `src: string` sprite sheet path
- `maxCount?: number` max simultaneous sprites
- `speed?: number` base movement speed
- `speedVariance?: number` random speed variance factor
- `direction?: { x: number; y: number }` primary movement direction
- `directionVariance?: number` random direction spread (degrees)
- `oscillation?: { amplitude?: number; frequency?: number }` flight wobble
- `fps?: number` sprite animation FPS
- `zIndex?: number` draw order
- `parallaxFactor?: number` parallax override
- `scale?: number` sprite scale multiplier
- `opacity?: number` opacity multiplier

Small snippet:

```ts
const spriteEffects: SpriteEffectConfig[] = [
  { id: "birds", src: "/bird.png", maxCount: 6, speed: 70, direction: { x: 1, y: 0 }, zIndex: 10 },
];
```

### `FogEffectConfig`
Properties:
- `id: string` unique fog ID
- `src: string` fog texture path
- `position?: { x?: number; y?: number }` map offset
- `direction?: { x: number; y: number }` drift direction
- `speed?: number` drift speed
- `opacity?: number` base opacity
- `opacityPulse?: FogOpacityPulse` fade pulse config
- `scaleBreathing?: FogScaleBreathing` size breathing config
- `zIndex?: number` draw order
- `parallaxFactor?: number` parallax override

`FogOpacityPulse` properties:
- `minOpacity?: number`
- `maxOpacity?: number`
- `duration?: number`
- `easing?: EasingConfig`

`FogScaleBreathing` properties:
- `amplitude?: number`
- `duration?: number`
- `easing?: EasingConfig`

Small snippet:

```ts
const fogEffects: FogEffectConfig[] = [
  {
    id: "mist",
    src: "/fog.webp",
    speed: 18,
    opacityPulse: { minOpacity: 0.25, maxOpacity: 0.7, duration: 4 },
  },
];
```

### `ParticleEffectConfig`
Properties:
- `id: string` unique effect ID
- `mode?: "twinkle" | "drift" | "glow"` particle behavior
- `maxCount?: number` max particles
- `color?: string` particle color
- `size?: number` base size
- `sizeVariance?: number` random size variance
- `src?: string` optional particle texture
- `region?: { x: number; y: number; width: number; height: number }` spawn region
- `regionMode?: "map" | "container"` region coordinate space
- `layerId?: string` attach to a specific layer
- `twinkleDuration?: number` twinkle cycle duration
- `twinkleDurationVariance?: number` twinkle duration variance
- `driftDirection?: { x: number; y: number }` drift direction
- `driftDirectionVariance?: number` drift angle variance
- `driftSpeed?: number` drift speed
- `driftSpeedVariance?: number` drift speed variance
- `driftDistance?: number` drift distance before respawn
- `glowStyle?: "soft" | "bloom" | "pulse" | "all"` glow appearance
- `glowMovement?: "stationary" | "drift"` glow motion
- `glowDuration?: number` glow cycle duration
- `glowDurationVariance?: number` glow duration variance
- `zIndex?: number` draw order
- `parallaxFactor?: number` parallax override
- `opacity?: number` base opacity
- `maskSrc?: string` optional mask texture
- `maskChannel?: MaskChannel` mask channel (`"r" | "g" | "b"`)
- `maskBehavior?: "spawn" | "constrain" | "both"` mask constraint behavior
- `maskThreshold?: number` mask inclusion threshold

Small snippet:

```ts
const particleEffects: ParticleEffectConfig[] = [
  {
    id: "sparkles",
    mode: "glow",
    maxCount: 40,
    region: { x: 200, y: 120, width: 800, height: 500 },
    glowStyle: "all",
  },
];
```

### `ShaderEffectConfig`
Properties:
- `id: string` unique effect ID
- `fragmentShader?: string` custom fragment shader
- `vertexShader?: string` custom vertex shader
- `src?: string` optional texture injected as `uTexture`
- `space?: "map" | "viewport"` effect space
- `region?: { x: number; y: number; width: number; height: number }` quad bounds
- `uniforms?: Record<string, { value: unknown }>` custom uniforms
- `transparent?: boolean` material transparency
- `depthWrite?: boolean` depth-buffer writing
- `zIndex?: number` draw order
- `parallaxFactor?: number` parallax override
- `preset?: ShaderPresetName` built-in preset
- `presetParams?: Record<string, unknown>` preset params
- `maskSrc?: string` optional mask texture
- `maskChannel?: MaskChannel` mask channel

Small snippet:

```ts
const shaderEffects: ShaderEffectConfig[] = [
  {
    id: "heat",
    preset: "heatHaze",
    presetParams: { intensity: 0.5 },
    region: { x: 300, y: 200, width: 500, height: 280 },
  },
];
```

### `MaskEffectConfig`
Properties:
- `id: string` unique mask-group ID
- `src: string` RGB mask texture path
- `pinnedTo?: string` layer ID to pin effects to
- `red?: MaskChannelEffect` effect for red channel
- `green?: MaskChannelEffect` effect for green channel
- `blue?: MaskChannelEffect` effect for blue channel
- `space?: "map" | "viewport"` shader effect space
- `zIndex?: number` base draw order for generated effects
- `parallaxFactor?: number` parallax override for group
- `transparent?: boolean` shader material transparency
- `maskBehavior?: "spawn" | "constrain" | "both"` particle mask behavior
- `maskThreshold?: number` mask inclusion threshold

`MaskChannelEffect` variants:
- `MaskChannelShaderEffect`: `{ type?: "shader", preset?, presetParams?, fragmentShader?, vertexShader?, uniforms?, src? }`
- `MaskChannelParticleEffect`: `{ type: "particles", config: Omit<ParticleEffectConfig, "id" | "maskSrc" | "maskChannel" | "maskBehavior" | "maskThreshold"> }`

Small snippet:

```ts
const maskEffects: MaskEffectConfig[] = [
  {
    id: "terrain-mask",
    src: "/maps/demo-mask.png",
    red: { type: "shader", preset: "glow" },
    green: { type: "particles", config: { mode: "twinkle", maxCount: 30 } },
  },
];
```

### `LayerShaderConfig`
Properties:
- `vertexShader?: string` custom vertex shader
- `fragmentShader?: string` custom fragment shader
- `uniforms?: Record<string, { value: unknown }>` custom uniforms
- `transparent?: boolean` material transparency
- `depthWrite?: boolean` depth-buffer writing
- `preset?: ShaderPresetName` built-in preset
- `presetParams?: Record<string, unknown>` preset params
- `maskSrc?: string` mask texture path
- `maskChannel?: MaskChannel` mask channel

Auto uniforms available to layer shaders:
- `uTime`
- `uResolution`
- `uTexture`
- `uViewport`

Small snippet:

```ts
const overlayLayer: MapLayer = {
  id: "overlay",
  src: "/overlay.webp",
  zIndex: 1,
  shaderConfig: { preset: "chromaticAberration", presetParams: { amount: 0.005 } },
};
```

### `LoadingStyleConfig`
Properties:
- `barColor?: string`
- `backgroundColor?: string`
- `textColor?: string`
- `barHeight?: number`
- `font?: string`

Small snippet:

```ts
const loadingStyle: LoadingStyleConfig = {
  barColor: "#66e0ff",
  backgroundColor: "rgba(0,0,0,0.6)",
  textColor: "#ffffff",
};
```

### `RenderConfig`
Properties:
- `dpr?: number | [number, number]` renderer DPR or capped DPR range
- `antialias?: boolean` toggle MSAA
- `powerPreference?: "default" | "high-performance" | "low-power"`

Small snippet:

```ts
const renderConfig: RenderConfig = {
  dpr: [1, 1.5],
  antialias: false,
  powerPreference: "high-performance",
};
```

## Animation Types (`LayerAnimation`)

`LayerAnimation` can be one of:
- `BounceAnimation`
- `CarouselAnimation`
- `FadeAnimation`
- `WobbleAnimation`

### `BounceAnimation`
Properties:
- `type: "bounce"`
- `direction?: { x: number; y: number }`
- `amplitude?: number`
- `duration?: number`
- `easing?: EasingConfig`

### `CarouselAnimation`
Properties:
- `type: "carousel"`
- `direction?: { x: number; y: number }`
- `speed?: number`
- `mode?: "wrap" | "infinite"`

### `FadeAnimation`
Properties:
- `type: "fade"`
- `minOpacity?: number`
- `maxOpacity?: number`
- `duration?: number`
- `easing?: EasingConfig`

### `WobbleAnimation`
Properties:
- `type: "wobble"`
- `offset?: { x: number; y: number }`
- `duration?: number`
- `easing?: EasingConfig`

Small snippet:

```ts
const animatedLayer: MapLayer = {
  id: "cloud",
  src: "/cloud-slide-front.webp",
  zIndex: 2,
  animation: [
    { type: "carousel", direction: { x: 1, y: 0 }, speed: 35, mode: "wrap" },
    { type: "fade", minOpacity: 0.5, maxOpacity: 1, duration: 3 },
  ],
};
```

## Easing

`EasingConfig` supports:
- Presets: `"linear" | "ease-in" | "ease-out" | "ease-in-out"`
- Custom cubic-bezier tuple: `[x1, y1, x2, y2]`

## Exports

```ts
export { InteractiveMap } from "@interactive-map/core";
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
  LoadingStyleConfig,
  MaskChannel,
  MaskChannelEffect,
  MaskChannelParticleEffect,
  MaskChannelShaderEffect,
  MaskEffectConfig,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  ParallaxConfig,
  PanConfig,
  RenderConfig,
  ShaderEffectConfig,
  ShaderPresetName,
  SpriteEffectConfig,
  WobbleAnimation,
  ZoomConfig,
} from "@interactive-map/core";
```
