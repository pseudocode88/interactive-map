# InteractiveMap - Project Status

**Last Updated:** 2026-02-18
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

---

## Remaining Chunks

### Chunk 4: Zoom Controls
**Status:** Not Started

Scope (from project brief):
- Scroll-wheel zoom in/out
- Pinch-to-zoom for touch devices
- Bounded zoom range (min/max limits)
- Smooth zoom animation/lerp
- Update pan boundaries dynamically based on current zoom level
- Pan controls already anticipate zoom integration (boundary clamping adjusts with zoom)

### Chunk 5: Markers & Events
**Status:** Not Started

Scope (from project brief):
- Marker system rendered on top of map layers
- Configurable marker positioning (world-space coordinates)
- Click/tap event handling on markers
- Callback/event emission on marker interaction
- Markers should scale appropriately with zoom

### Chunk 6: Animated Elements
**Status:** Not Started

Scope (from project brief):
- Support animated map elements (PNG layers or markers)
- Bounce animation (loop)
- Translate animation (directional loop)
- Configurable animation parameters per element
- Animations should work within the existing layer/rendering system

---

## Architecture Overview

```
packages/interactive-map/src/
├── components/
│   ├── InteractiveMap.tsx      # Public entry point
│   ├── MapScene.tsx            # Scene container, sorts/renders layers
│   ├── MapLayerMesh.tsx        # Individual layer rendering
│   └── CameraController.tsx   # Pan (+ future zoom) controls
├── hooks/
│   ├── useBaseImageSize.ts     # Base image dimension detection
│   └── useContainerSize.ts     # Container ResizeObserver
├── types/
│   └── index.ts                # MapLayer, InteractiveMapProps, PanConfig
└── index.ts                    # Barrel exports
```
