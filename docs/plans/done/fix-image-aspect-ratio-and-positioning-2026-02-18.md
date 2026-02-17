---
Name: Fix Image Aspect Ratio & Layer Positioning
Type: Bug Fix + Enhancement
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
The base map and overlay images currently stretch to fill the container because the orthographic camera frustum is hardcoded to the base image's pixel dimensions while the canvas fills the container (e.g. `100vw × 100vh`). When the container aspect ratio differs from the image aspect ratio, images distort. Additionally, there is no way to position layers with an offset from center. This fix retains the image aspect ratio (width matches container, height scales proportionally) and adds optional `x`/`y` pixel-offset positioning to each layer.

# Plan & Instruction

## Step 1: Update `MapLayer` type
**File:** `packages/interactive-map/src/types/index.ts`

Add an optional `position` field to the `MapLayer` interface:
```ts
export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: { x?: number; y?: number }; // pixel offset from center, defaults to {x:0, y:0}
}
```

## Step 2: Create `useContainerSize` hook
**File:** `packages/interactive-map/src/hooks/useContainerSize.ts` (new file)

- Create a hook that accepts a `RefObject<HTMLDivElement | null>`
- Use `ResizeObserver` to track the container div's width and height
- Return `{ width: number; height: number } | null`
- Clean up the observer on unmount
- Follow the same pattern as the existing `useBaseImageSize` hook

## Step 3: Fix camera frustum in `InteractiveMap.tsx`
**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

- Add a `useRef<HTMLDivElement>(null)` for the container div
- Attach the ref to the outer `<div>` wrapper
- Use the new `useContainerSize` hook to get container dimensions
- Guard: if `containerSize` is null, render the empty placeholder (same as current baseSize null check)
- Compute camera frustum using container aspect ratio:
  ```
  halfWidth = baseSize.width / 2
  halfHeight = halfWidth * (containerSize.height / containerSize.width)
  ```
- This ensures width fills the view exactly, height adjusts proportionally — no stretching

## Step 4: Update `MapLayerMesh` to use natural texture dimensions + position
**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

- Update the interface — remove `baseWidth` and `baseHeight`, add optional `position`:
  ```ts
  interface MapLayerMeshProps {
    src: string;
    zIndex: number;
    position?: { x?: number; y?: number };
  }
  ```
- After loading the texture via `useLoader(TextureLoader, src)`, read the texture's natural size from `texture.image.width` and `texture.image.height`
- Use these natural dimensions for the `<planeGeometry args={[...]} />`
- Set mesh position to `[position?.x ?? 0, position?.y ?? 0, zIndex * 0.01]`

## Step 5: Update `MapScene.tsx`
**File:** `packages/interactive-map/src/components/MapScene.tsx`

- Pass `layer.position` to each `<MapLayerMesh>` component
- Remove `baseWidth` and `baseHeight` from `<MapLayerMesh>` props (no longer needed)
- Keep passing `baseWidth` and `baseHeight` to `<CameraController>` (still needed for pan bounds)

## Step 6: Update `CameraController.tsx` interaction mesh
**File:** `packages/interactive-map/src/components/CameraController.tsx`

- The invisible interaction mesh currently uses `baseWidth × baseHeight`, which may not cover the full visible area when the container is wider than the image
- Use `useThree` to read the orthographic camera bounds (`camera.left`, `camera.right`, `camera.top`, `camera.bottom`) to compute the full frustum size
- Set the interaction mesh plane geometry to cover the full frustum: `[camera.right - camera.left, camera.top - camera.bottom]`
- Alternatively, use a simpler approach: `[Math.max(baseWidth, baseWidth * 2), Math.max(baseHeight, baseHeight * 2)]` to ensure full coverage

## Step 7: Update demo page
**File:** `apps/demo/src/app/page.tsx`

- Add `position` to the overlay layer to demonstrate the feature:
  ```ts
  const layers = [
    { id: "base", src: "/base-map.png", zIndex: 0 },
    { id: "overlay", src: "/overlay.png", zIndex: 1, position: { x: 100, y: -50 } },
  ];
  ```

# Acceptance Criteria
- Base map maintains its natural aspect ratio — width matches the container, height scales proportionally
- Overlay images maintain their natural aspect ratio (use their own texture dimensions, not base map dimensions)
- Resizing the browser window does not distort any images
- Layers without `position` render centered (default behavior)
- Layers with `position: { x, y }` render offset from center by the specified pixel amounts
- Panning works correctly across the full visible area including any empty space beside the image
- No regressions in existing pan easing or layer stacking behavior

# Log
- **2026-02-18**: Created plan for fixing image stretching and adding layer positioning support
- **2026-02-18**: Corrected frustum calculation — width matches container (not height). Changed from `halfHeight-based` to `halfWidth-based` calculation
