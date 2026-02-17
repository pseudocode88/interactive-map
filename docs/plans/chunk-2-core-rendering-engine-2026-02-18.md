---
Name: Chunk 2 - Core Rendering Engine
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
Implement the core rendering engine that loads PNG images as textured planes in Three.js, stacks them by z-index, sets up an orthographic camera sized to the base image dimensions, and handles responsive resizing of the container. The first layer (lowest zIndex) acts as the base image that defines the map's world boundaries.

# Plan & Instruction

## Step 1: Expand the Type Definitions

Update `packages/interactive-map/src/types/index.ts`:

```ts
export interface MapLayer {
  id: string;
  src: string;       // URL or path to PNG image
  zIndex: number;    // stacking order; lowest = base layer
}

export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;    // CSS value, e.g. "100%", "800px"
  height?: string;   // CSS value
  className?: string;
}
```

> No changes needed — the existing types are sufficient for this chunk. Noting here for clarity.

## Step 2: Create the `MapLayer` Component

Create `packages/interactive-map/src/components/MapLayerMesh.tsx`

This component renders a single layer as a textured plane in the Three.js scene.

- Accept props: `src` (string), `zIndex` (number), `baseWidth` (number), `baseHeight` (number)
- Use `useLoader(TextureLoader, src)` from `@react-three/fiber` to load the PNG texture
- Set the texture's `minFilter` and `magFilter` to `THREE.LinearFilter` for crisp rendering
- Render a `<mesh>` with:
  - `position={[0, 0, zIndex * 0.01]}` — small z-offset per layer to avoid z-fighting
  - `<planeGeometry args={[baseWidth, baseHeight]} />` — sized to match the base image in world units
  - `<meshBasicMaterial map={texture} transparent={true} />` — transparent so upper layers show through

```tsx
import { useLoader } from "@react-three/fiber";
import { TextureLoader, LinearFilter } from "three";

interface MapLayerMeshProps {
  src: string;
  zIndex: number;
  baseWidth: number;
  baseHeight: number;
}

export function MapLayerMesh({ src, zIndex, baseWidth, baseHeight }: MapLayerMeshProps) {
  const texture = useLoader(TextureLoader, src);

  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;

  return (
    <mesh position={[0, 0, zIndex * 0.01]}>
      <planeGeometry args={[baseWidth, baseHeight]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}
```

## Step 3: Create the `useBaseImageSize` Hook

Create `packages/interactive-map/src/hooks/useBaseImageSize.ts`

This hook loads the base image (lowest zIndex layer) and returns its natural pixel dimensions. These dimensions define the world coordinate system.

- Accept `src` (string) as the base image URL
- Use a `useState` to store `{ width: number; height: number } | null`
- Use a `useEffect` to create an `Image()` object, set its `src`, and on `onload` extract `naturalWidth` and `naturalHeight`
- Return the dimensions (or `null` while loading)

```ts
import { useState, useEffect } from "react";

interface ImageSize {
  width: number;
  height: number;
}

export function useBaseImageSize(src: string): ImageSize | null {
  const [size, setSize] = useState<ImageSize | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = src;
  }, [src]);

  return size;
}
```

## Step 4: Create the `MapScene` Component

Create `packages/interactive-map/src/components/MapScene.tsx`

This is the inner Three.js scene component rendered inside `<Canvas>`. It is responsible for:
- Sorting layers by zIndex
- Rendering each layer using `<MapLayerMesh />`

Props: `layers` (MapLayer[]), `baseWidth` (number), `baseHeight` (number)

```tsx
import { MapLayerMesh } from "./MapLayerMesh";
import type { MapLayer } from "../types";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
}

export function MapScene({ layers, baseWidth, baseHeight }: MapSceneProps) {
  const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      {sorted.map((layer) => (
        <MapLayerMesh
          key={layer.id}
          src={layer.src}
          zIndex={layer.zIndex}
          baseWidth={baseWidth}
          baseHeight={baseHeight}
        />
      ))}
    </>
  );
}
```

## Step 5: Update `InteractiveMap` Component

Rewrite `packages/interactive-map/src/components/InteractiveMap.tsx`

This is the main public component. It:
1. Determines the base layer (layer with lowest zIndex)
2. Uses `useBaseImageSize` to get the base image dimensions
3. Sets up `<Canvas>` with an orthographic camera configured to fit the entire base image
4. Wraps layers in a `<Suspense>` boundary (since `useLoader` suspends)
5. Shows nothing (or a loading state) until base image dimensions are known

```tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useMemo } from "react";
import type { InteractiveMapProps } from "../types";
import { useBaseImageSize } from "../hooks/useBaseImageSize";
import { MapScene } from "./MapScene";

export function InteractiveMap({
  layers,
  width = "100%",
  height = "100%",
  className,
}: InteractiveMapProps) {
  const baseLayer = useMemo(() => {
    if (layers.length === 0) return null;
    return [...layers].sort((a, b) => a.zIndex - b.zIndex)[0];
  }, [layers]);

  const baseSize = useBaseImageSize(baseLayer?.src ?? "");

  if (!baseLayer || !baseSize) {
    return <div style={{ width, height }} className={className} />;
  }

  const halfW = baseSize.width / 2;
  const halfH = baseSize.height / 2;

  return (
    <div style={{ width, height }} className={className}>
      <Canvas
        orthographic
        camera={{
          left: -halfW,
          right: halfW,
          top: halfH,
          bottom: -halfH,
          near: 0.1,
          far: 100,
          position: [0, 0, 10],
        }}
        gl={{ antialias: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <MapScene
            layers={layers}
            baseWidth={baseSize.width}
            baseHeight={baseSize.height}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
```

### Key decisions:
- **Orthographic camera** — maps are 2D, perspective distortion is undesirable
- **Camera frustum matches base image pixel dimensions** — 1 world unit = 1 pixel. This makes positioning intuitive and keeps math simple for future pan/zoom
- **Camera positioned at z=10** looking toward z=0 — layers sit near z=0 with small offsets
- **`<Suspense>`** — `useLoader` suspends while textures load, so we wrap in Suspense with `fallback={null}` (canvas stays empty until all textures are ready)

## Step 6: Handle Responsive Resize

The `<Canvas>` from React Three Fiber **automatically handles resize** — it uses a `ResizeObserver` on its parent div internally. When the container div resizes, the canvas re-renders at the new size.

However, the orthographic camera frustum is set in world units (base image pixels), not in screen pixels. R3F's `<Canvas>` automatically adjusts the viewport to fit, letterboxing as needed. No additional resize handling code is required for this chunk.

> **Note:** In a future chunk (pan/zoom), we may need to adjust the camera frustum on resize to maintain the correct visible area. For now, the default R3F behavior is sufficient.

## Step 7: Update Barrel Exports

Update `packages/interactive-map/src/index.ts` to export the new types (no changes needed — existing exports already cover `InteractiveMap`, `InteractiveMapProps`, and `MapLayer`).

## Step 8: Update Demo App to Test Layers

Update `apps/demo/src/app/page.tsx` to render actual layers:

1. Add 2-3 test PNG images to `apps/demo/public/`:
   - `base-map.png` — the base layer (e.g. a background terrain image)
   - `overlay.png` — a transparent overlay layer (e.g. roads, buildings)
   > Use any test images for now. They should be the same dimensions. Recommended: 1920x1080 or similar.

2. Update `page.tsx`:
```tsx
import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  { id: "overlay", src: "/overlay.png", zIndex: 1 },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <InteractiveMap layers={layers} />
    </main>
  );
}
```

## Step 9: Verify

1. Run `pnpm dev` from the repo root
2. Open `http://localhost:3000` in a browser
3. Verify:
   - The base map image is visible and fills the canvas (letterboxed to maintain aspect ratio)
   - The overlay layer renders on top of the base layer
   - Resizing the browser window causes the canvas to resize and the map re-renders correctly
   - No console errors related to Three.js or texture loading
4. Run `pnpm --filter @interactive-map/core tsc --noEmit` — no TypeScript errors

# Acceptance Criteria

- [ ] `MapLayerMesh` component loads a PNG texture and renders it as a plane
- [ ] `useBaseImageSize` hook resolves the natural dimensions of the base image
- [ ] `MapScene` component sorts and renders all layers by zIndex
- [ ] `InteractiveMap` sets up an orthographic camera sized to the base image dimensions
- [ ] Layers stack correctly — higher zIndex layers render on top with transparency
- [ ] The canvas resizes responsively when the parent container changes size
- [ ] Demo app renders at least 2 stacked layers with no console errors
- [ ] TypeScript compiles with no errors (`tsc --noEmit`)

# Log
- **2026-02-18**: Plan created for Chunk 2 — Core Rendering Engine covering texture loading, orthographic camera, layer stacking, responsive container, and demo verification.
