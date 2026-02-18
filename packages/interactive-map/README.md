# @interactive-map/core

Reusable interactive map component for React apps using Three.js via React Three Fiber.

## What It Supports

- Multi-layer map rendering from PNG images
- Pan with boundary clamping
- Zoom with wheel and pinch gestures
- Per-layer animations (single or parallel):
  - `bounce`
  - `carousel` (`wrap` or `infinite`)
  - `fade`
  - `wobble`

## Install

```bash
pnpm add @interactive-map/core three @react-three/fiber @react-three/drei
```

Peer dependencies:
- `react` 18 or 19
- `react-dom` 18 or 19

## Basic Usage

```tsx
import { InteractiveMap } from "@interactive-map/core";
import type { MapLayer } from "@interactive-map/core";

const layers: MapLayer[] = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: -10 },
    animation: [
      { type: "bounce", amplitude: 15, duration: 2, easing: "ease-in-out" },
      { type: "fade", minOpacity: 0.4, maxOpacity: 1, duration: 3 },
    ],
  },
];

export default function Page() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 2, initialZoom: 1.4 }}
      />
    </div>
  );
}
```

## Implementation Example (Next.js)

Use this pattern in `app/page.tsx` or any client component.

```tsx
"use client";

import { InteractiveMap } from "@interactive-map/core";
import type { MapLayer } from "@interactive-map/core";

const layers = [
  {
    id: "cloud-back",
    src: "/overlay-cloud-back.png",
    zIndex: -1,
    animation: [
      {
        type: "carousel",
        direction: { x: 1, y: 0 },
        speed: 40,
        mode: "wrap",
      },
    ],
  },
  { id: "base", src: "/base-map.png", zIndex: 0 },
  {
    id: "cloud-front",
    src: "/overlay.png",
    zIndex: 1,
    position: { x: 0, y: -10 },
    animation: [
      {
        type: "bounce",
        direction: { x: 0, y: 1 },
        amplitude: 14,
        duration: 2,
        easing: "ease-in-out",
      },
      {
        type: "fade",
        minOpacity: 0.45,
        maxOpacity: 1,
        duration: 3,
        easing: [0.25, 0.1, 0.25, 1],
      },
    ],
  },
] satisfies MapLayer[];

export default function HomePage() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{
          enabled: true,
          minZoom: 1,
          maxZoom: 2.5,
          initialZoom: 1.3,
          scrollSpeed: 0.001,
          easingFactor: 0.15,
        }}
      />
    </main>
  );
}
```

Notes:
- Place image files inside your Next.js `public/` folder.
- Keep the base layer at the lowest `zIndex` (it defines map bounds).
- Combine multiple animations in `animation: []` to run them in parallel.

## `InteractiveMap` Props

- `layers: MapLayer[]` (required)
- `width?: string` (default: `"100%"`)
- `height?: string` (default: `"100%"`)
- `className?: string`
- `panConfig?: PanConfig`
- `zoomConfig?: ZoomConfig`

## Types

### `MapLayer`

- `id: string`
- `src: string`
- `zIndex: number`
- `position?: { x?: number; y?: number }`
- `animation?: LayerAnimation | LayerAnimation[]`

The base map is derived from the lowest `zIndex` layer.

### `PanConfig`

- `enabled?: boolean` (default: `true`)
- `easingFactor?: number` (default: `0.15`)

### `ZoomConfig`

- `enabled?: boolean` (default: `true`)
- `minZoom?: number` (default: `1`)
- `maxZoom?: number` (default: `3`)
- `initialZoom?: number` (default: `1`, clamped to min/max)
- `scrollSpeed?: number` (default: `0.001`)
- `easingFactor?: number` (default: `0.15`)

### Animation Types

- `BounceAnimation`
- `CarouselAnimation`
- `FadeAnimation`
- `WobbleAnimation`

Easing supports:
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
  InteractiveMapProps,
  LayerAnimation,
  MapLayer,
  PanConfig,
  WobbleAnimation,
  ZoomConfig,
} from "@interactive-map/core";
```
