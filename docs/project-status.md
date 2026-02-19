# InteractiveMap - Project Status

**Last Updated:** 2026-02-19
**Branch:** main (clean)

---

## Completed Chunks

### Chunk 1: Project Setup & Scaffolding
**Status:** Done
**Plan:** [chunk-1-project-setup-2026-02-18.md](plans/done/chunk-1-project-setup-2026-02-18.md)

- Monorepo structure with pnpm workspaces
- `packages/interactive-map` component library
- `apps/demo` Next.js demo application
- TypeScript configuration and base tooling

### Chunk 2: Core Rendering Engine
**Status:** Done
**Plan:** [chunk-2-core-rendering-engine-2026-02-18.md](plans/done/chunk-2-core-rendering-engine-2026-02-18.md)

- Multi-layer PNG rendering with Three.js
- Orthographic camera (1 world unit = 1 pixel)
- `MapLayerMesh` component for texture loading
- `useBaseImageSize` hook for detecting base image dimensions
- Responsive container resizing

### Chunk 3: Pan Controls
**Status:** Done
**Plan:** [chunk-3-pan-controls-2026-02-18.md](plans/done/chunk-3-pan-controls-2026-02-18.md)

- `CameraController` with pointer event handling (mouse + touch)
- Screen-space to world-space drag conversion
- Smooth camera lerp with configurable easing
- Boundary clamping (base image always fills viewport)

### Fix: Image Aspect Ratio & Layer Positioning
**Status:** Done
**Plan:** [fix-image-aspect-ratio-and-positioning-2026-02-18.md](plans/done/fix-image-aspect-ratio-and-positioning-2026-02-18.md)

- `useContainerSize` hook (ResizeObserver-based)
- Width-based frustum calculation for correct aspect ratio
- Layer positioning with optional x/y pixel offsets
- Images maintain natural aspect ratio without stretching

### Chunk 4: Zoom Controls
**Status:** Done
**Plan:** [chunk-4-zoom-controls-2026-02-18.md](plans/done/chunk-4-zoom-controls-2026-02-18.md)

- Scroll-wheel zoom in/out with cursor-anchored zooming
- Pinch-to-zoom for touch devices with midpoint anchoring
- Bounded zoom range (min/max limits) with configurable `ZoomConfig`
- Smooth zoom animation/lerp with easing
- Dynamic pan boundary clamping based on current zoom level

### Fix: Responsive Cover Fitting
**Status:** Done
**Plan:** [fix-responsive-cover-fitting-2026-02-18.md](plans/done/fix-responsive-cover-fitting-2026-02-18.md)

- Cover-fit strategy: compares container aspect ratio to image aspect ratio
- Portrait/tall containers fit to height (overflow width, pan left/right)
- Landscape/wide containers fit to width (overflow height, pan up/down)
- No empty space at any screen size; works across desktop, tablet, mobile

### Chunk 5: Layer Animations
**Status:** Done
**Plan:** [chunk-5-layer-animations-2026-02-18.md](plans/done/chunk-5-layer-animations-2026-02-18.md)

- Animation types: bounce, carousel, fade, wobble
- Parallel animation chaining (multiple animations on same layer)
- Easing system: named presets (`linear`, `ease-in`, `ease-out`, `ease-in-out`) + custom cubic-bezier
- Per-animation easing control
- Carousel: wrap (seamless loop at base image bounds) or infinite mode
- Delta accumulation for tab visibility pause (no CPU when hidden)
- Direct mesh/material mutation in `useFrame` (zero React re-renders)

### Fix: Texture Color Space
**Status:** Done
**Plan:** [fix-texture-color-space-2026-02-18.md](plans/done/fix-texture-color-space-2026-02-18.md)

- Set texture color space to sRGB on all loaded textures
- Disabled tone mapping on the renderer
- Images now render with accurate color matching the source files

### Enhancement: Base Layer Viewport Lock
**Status:** Done
**Plan:** [base-layer-viewport-lock-2026-02-18.md](plans/done/base-layer-viewport-lock-2026-02-18.md)

- `baseLayerId` prop on `InteractiveMap` to specify which layer the camera locks to
- Camera frustum, pan bounds, and zoom bounds reference the designated base layer
- Defaults to the layer with the lowest zIndex if not specified

### Feature: Layer Parallax
**Status:** Done
**Plan:** [layer-parallax-2026-02-18.md](plans/done/layer-parallax-2026-02-18.md)

- Opt-in parallax via `parallaxConfig` prop
- Closer layers (higher zIndex) move faster, farther layers move slower
- Two zoom parallax modes: depth (scale-based pop-out) and drift (positional offset)
- Auto-scaled layers to prevent empty edges during parallax movement
- `utils/parallax.ts` for parallax factor calculations

### Chunk 6: Map Markers & Interaction
**Status:** Done
**Plan:** [chunk-6-map-markers-2026-02-18.md](plans/done/chunk-6-map-markers-2026-02-18.md)

- `MapMarker` type with pixel-coordinate positioning relative to base image
- `MarkerDot` component with pulsing glow animation
- `MarkerTooltip` component shown on hover
- Click handler with smooth zoom-to-marker animation
- `resetView` prop to zoom back out programmatically
- Configurable marker color and labels
- `onMarkerClick` and `onHoverChange` callbacks

### Chunk 7a: Sprite Effects (Flying Birds, Butterflies, etc.)
**Status:** Done
**Plan:** [chunk-7a-sprite-effects-2026-02-18.md](plans/done/chunk-7a-sprite-effects-2026-02-18.md)

- Generic sprite effect system (reusable for birds, butterflies, leaves, etc.)
- Sprite sheet support with auto-detected grid layout
- Procedural natural-looking flight paths (spawn at edge, fly across, despawn/respawn)
- Configurable: maxCount, speed, speedVariance, direction, directionVariance, oscillation
- Multiple independent sprite groups via array of configs
- Parallax-aware (participates in parallax like regular layers)
- Frame-by-frame sprite sheet animation

### Chunk 7c: Fog Effects
**Status:** Done
**Plan:** [chunk-7c-fog-effects-2026-02-19.md](plans/done/chunk-7c-fog-effects-2026-02-19.md)

- Seamlessly tiling fog textures via `RepeatWrapping` + UV offset drift
- Three composable visual modes: drift, opacity pulse (breathing), scale breathing
- Per-effect easing configuration
- Multiple independent fog layers via array of `FogEffectConfig`
- `FogEffect` component with parallax support (depth + drift modes)
- `utils/fog.ts` for pure fog math (drift, opacity, scale)

### Chunk 7b: Sparkling / Particle Effects
**Status:** Done
**Plan:** [chunk-7b-sparkling-particle-effects-2026-02-19.md](plans/done/chunk-7b-sparkling-particle-effects-2026-02-19.md)

- Particle system with Three.js `Points` + `BufferGeometry` + custom `ShaderMaterial`
- Two visual modes: twinkle (stationary fade in/out) and drift (move + fade)
- Configurable sparkle regions or full map coverage
- `regionMode: "container"` for viewport-relative particle spawning
- Optional layer attachment (inherits position + parallax factor)
- Color-based (circle) or texture-based (PNG) rendering
- Per-particle alpha via custom shader, `AdditiveBlending` for glow
- `utils/particles.ts` for pure particle lifecycle math
- `ParticleEffect` component with parallax support (depth + drift modes)

### Chunk 7d-1: Layer Shader Support
**Status:** Done
**Plan:** [chunk-7d-1-layer-shader-support-2026-02-19.md](plans/done/chunk-7d-1-layer-shader-support-2026-02-19.md)

- Optional `shaderConfig` on `MapLayer` to replace `meshBasicMaterial` with custom `ShaderMaterial`
- Auto-injected uniforms: `uTime`, `uResolution`, `uTexture`, `uViewport`
- Default passthrough vertex shader when omitted
- Custom uniforms support with collision override
- `utils/shaderDefaults.ts` helper
- Separate uniforms objects for main mesh and carousel clone

### Chunk 7d-2: Standalone Shader Effects
**Status:** Done
**Plan:** [chunk-7d-2-standalone-shader-effects-2026-02-19.md](plans/done/chunk-7d-2-standalone-shader-effects-2026-02-19.md)

- `ShaderEffectConfig` type and `ShaderEffect` component
- Fullscreen (base image) or region-based shader quad
- Optional texture loading via `src` (injected as `uTexture`)
- Auto-injected uniforms: `uTime`, `uResolution`, `uViewport`
- Two coordinate spaces: `map` (default, parallax-aware) and `viewport` (screen-fixed overlay)
- `buildStandaloneShaderUniforms` utility + barrel exports
- Conditional texture loading via wrapper component pattern

---

## Remaining Chunks

### Chunk 7d-3: Built-in Shader Presets
**Status:** Not Started

Scope:
- Preset library usable by both layer shaders and standalone shader effects
- Presets: water ripple, heat haze, glow, dissolve, chromatic aberration
- Configurable parameters per preset
- `utils/shaderPresets.ts` preset registry

---

## Architecture Overview

```
packages/interactive-map/src/
├── components/
│   ├── InteractiveMap.tsx      # Public entry point
│   ├── MapScene.tsx            # Scene container, sorts/renders layers + fog + particles + sprites + markers
│   ├── MapLayerMesh.tsx        # Individual layer rendering (sRGB, parallax)
│   ├── CameraController.tsx    # Pan + zoom controls (cover-fit, baseLayerId aware)
│   ├── MarkerDot.tsx           # Pulsing glow marker rendered on map
│   ├── MarkerTooltip.tsx       # Hover tooltip for markers
│   ├── SpriteEffect.tsx        # Animated sprite sheet effects (birds, butterflies, etc.)
│   ├── FogEffect.tsx           # Animated fog overlay with tiling, opacity pulse, scale breathing
│   ├── ParticleEffect.tsx      # GPU particle system (twinkle/drift) with custom ShaderMaterial
│   └── ShaderEffect.tsx        # Standalone shader quad (map-space or viewport-space)
├── hooks/
│   ├── useBaseImageSize.ts     # Base image dimension detection
│   └── useContainerSize.ts     # Container ResizeObserver
├── utils/
│   ├── easing.ts               # Cubic-bezier + named preset easing
│   ├── animation.ts            # Pure animation math (bounce, carousel, fade, wobble)
│   ├── parallax.ts             # Parallax factor calculations (depth + drift modes)
│   ├── spriteSheet.ts          # Sprite sheet grid detection + frame UV calculation
│   ├── spriteInstances.ts      # Sprite instance lifecycle (spawn, update, despawn)
│   ├── fog.ts                  # Pure fog math (drift, opacity pulse, scale breathing)
│   ├── particles.ts            # Pure particle math (twinkle/drift lifecycle)
│   └── shaderDefaults.ts       # Default vertex shader + auto-injected uniform builder
├── types/
│   └── index.ts                # MapLayer, MapMarker, LayerShaderConfig, ShaderEffectConfig, SpriteEffectConfig, FogEffectConfig, ParticleEffectConfig, InteractiveMapProps, etc.
└── index.ts                    # Barrel exports
```
