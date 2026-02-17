---
Name: Chunk 3 - Pan Controls
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18 (Review Fixes)
---

# Brief
Implement click-drag and touch-drag pan controls for the interactive map. The camera smoothly lerps to the target position with easing. Pan boundaries are enforced so the base image always fills the viewport (no empty space visible). The initial view is centered on the map. At the current zoom level (1x, full image visible), boundaries will naturally prevent panning; the system is designed to seamlessly support panning once zoom is added in Chunk 4.

# Plan & Instruction

## Step 1: Extend Type Definitions

Update `packages/interactive-map/src/types/index.ts` to add pan-related configuration types.

Add the following new interfaces and update `InteractiveMapProps`:

```ts
export interface PanConfig {
  enabled?: boolean;      // default: true
  easingFactor?: number;  // lerp factor per frame, 0-1. default: 0.15 (higher = snappier)
}

export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;  // NEW
}
```

Keep the existing `MapLayer` interface unchanged.

## Step 2: Create the `CameraController` Component

Create `packages/interactive-map/src/components/CameraController.tsx`

This component lives **inside** the `<Canvas>` and manages all camera movement. It handles:
- Pointer event tracking (mouse + touch via unified pointer events)
- Converting screen-space drag deltas to world-space camera movement
- Smooth lerp animation via `useFrame`
- Boundary clamping

### 2.1 Component Props

```ts
interface CameraControllerProps {
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;  // defaults applied by parent
}
```

### 2.2 Pointer Event Handling

Use the `onPointerDown`, `onPointerMove`, `onPointerUp`, and `onPointerLeave` events on a transparent interaction mesh that covers the full base image area. This ensures pointer events are captured within the Three.js scene.

**Interaction mesh approach:**
- Render an invisible `<mesh>` sized to `[baseWidth, baseHeight]` at `position={[0, 0, 5]}` (above all layers but below camera at z=10)
- Set `<meshBasicMaterial visible={false} />` so it's invisible but still receives pointer events

**Why an interaction mesh instead of DOM events on the canvas:**
- R3F's pointer events provide world-space intersection points via `event.unprojectedPoint`, making screen-to-world conversion trivial
- Automatically handles coordinate system differences
- Works consistently across mouse and touch

### 2.3 Drag State Management

Use `useRef` for mutable drag state (avoids re-renders during drag):

```ts
const dragState = useRef({
  isDragging: false,
  previousWorldPoint: { x: 0, y: 0 },
});
```

**onPointerDown:**
1. Check `panConfig.enabled` — if false, return
2. Call `event.stopPropagation()` to prevent event bubbling
3. Set `isDragging = true`
4. Store the world-space pointer position: `previousWorldPoint = { x: event.unprojectedPoint.x, y: event.unprojectedPoint.y }`
5. Call `(event.target as HTMLElement).setPointerCapture(event.pointerId)` to ensure move/up events are captured even if pointer leaves the canvas

**onPointerMove:**
1. If not dragging, return
2. Get current world-space pointer position from `event.unprojectedPoint`
3. Compute delta: `dx = previousWorldPoint.x - current.x`, `dy = previousWorldPoint.y - current.y`
   - Note: delta is **previous minus current** because dragging right should move the camera right (panning the map left)
4. Add delta to `targetPosition`: `targetPosition.current.x += dx`, `targetPosition.current.y += dy`
5. Clamp `targetPosition` within boundaries (see Step 2.5)
6. Update `previousWorldPoint` to current position

**onPointerUp / onPointerLeave:**
1. Set `isDragging = false`
2. Release pointer capture: `(event.target as HTMLElement).releasePointerCapture(event.pointerId)`

### 2.4 Smooth Camera Animation

Use a `targetPosition` ref and lerp the camera toward it each frame:

```ts
const targetPosition = useRef({ x: 0, y: 0 });
```

In `useFrame` callback:
```ts
useFrame((state) => {
  const camera = state.camera;
  const lerpFactor = panConfig.easingFactor;

  camera.position.x += (targetPosition.current.x - camera.position.x) * lerpFactor;
  camera.position.y += (targetPosition.current.y - camera.position.y) * lerpFactor;

  camera.updateProjectionMatrix();
});
```

**Important:** Call `camera.updateProjectionMatrix()` after modifying position to ensure the view updates.

### 2.5 Boundary Clamping

The boundaries ensure the base image always fills the viewport — no empty space is visible beyond the image edges.

**Boundary math:**

The orthographic camera has a frustum defined by `left`, `right`, `top`, `bottom`. The visible area in world units is:
- `visibleWidth = camera.right - camera.left`
- `visibleHeight = camera.top - camera.bottom`

The base image spans from `(-baseWidth/2, -baseHeight/2)` to `(baseWidth/2, baseHeight/2)` in world coordinates.

The camera position (center of the visible area) must be clamped so:
- `camera.x - visibleWidth/2 >= -baseWidth/2`  → `camera.x >= -baseWidth/2 + visibleWidth/2`
- `camera.x + visibleWidth/2 <= baseWidth/2`   → `camera.x <= baseWidth/2 - visibleWidth/2`
- Same logic for Y axis

```ts
function clampTarget(
  target: { x: number; y: number },
  camera: THREE.OrthographicCamera,
  baseWidth: number,
  baseHeight: number
) {
  const visibleW = camera.right - camera.left;
  const visibleH = camera.top - camera.bottom;

  const minX = -baseWidth / 2 + visibleW / 2;
  const maxX = baseWidth / 2 - visibleW / 2;
  const minY = -baseHeight / 2 + visibleH / 2;
  const maxY = baseHeight / 2 - visibleH / 2;

  // If visible area >= base image (zoom=1), lock to center (0,0)
  target.x = minX >= maxX ? 0 : Math.max(minX, Math.min(maxX, target.x));
  target.y = minY >= maxY ? 0 : Math.max(minY, Math.min(maxY, target.y));
}
```

**At zoom=1:** `visibleWidth = baseWidth`, so `minX = 0` and `maxX = 0`, meaning the camera is locked at center. No panning possible. This is correct behavior — panning becomes available once zoom is implemented in Chunk 4.

### 2.6 Full Component Structure

```tsx
"use client";

import { useRef } from "react";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import type { OrthographicCamera } from "three";
import type { PanConfig } from "../types";

interface CameraControllerProps {
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
}

export function CameraController({ baseWidth, baseHeight, panConfig }: CameraControllerProps) {
  const { camera } = useThree();
  const targetPosition = useRef({ x: 0, y: 0 });
  const dragState = useRef({
    isDragging: false,
    previousWorldPoint: { x: 0, y: 0 },
  });

  // Clamp helper (inline or extracted)
  // ... clampTarget function as defined in 2.5

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!panConfig.enabled) return;
    event.stopPropagation();
    dragState.current.isDragging = true;
    dragState.current.previousWorldPoint = {
      x: event.unprojectedPoint.x,
      y: event.unprojectedPoint.y,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!dragState.current.isDragging) return;
    const currentX = event.unprojectedPoint.x;
    const currentY = event.unprojectedPoint.y;
    const dx = dragState.current.previousWorldPoint.x - currentX;
    const dy = dragState.current.previousWorldPoint.y - currentY;

    targetPosition.current.x += dx;
    targetPosition.current.y += dy;
    clampTarget(targetPosition.current, camera as OrthographicCamera, baseWidth, baseHeight);

    dragState.current.previousWorldPoint = { x: currentX, y: currentY };
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    dragState.current.isDragging = false;
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
  };

  useFrame(() => {
    const lerpFactor = panConfig.easingFactor;
    camera.position.x += (targetPosition.current.x - camera.position.x) * lerpFactor;
    camera.position.y += (targetPosition.current.y - camera.position.y) * lerpFactor;
    camera.updateProjectionMatrix();
  });

  return (
    <mesh position={[0, 0, 5]} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}>
      <planeGeometry args={[baseWidth, baseHeight]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}
```

### 2.7 Cursor Styling

Add CSS cursor feedback for the pan interaction. In `InteractiveMap.tsx`, apply cursor styles to the container div:

```tsx
<div
  style={{
    width,
    height,
    cursor: "grab",
  }}
  className={className}
>
```

The `cursor: grab` provides visual feedback that the map is draggable. Note: `grabbing` cursor during active drag is handled automatically by the browser for pointer-captured elements in most cases. If not, this can be enhanced later.

## Step 3: Integrate CameraController into MapScene

Update `packages/interactive-map/src/components/MapScene.tsx`:

1. Import `CameraController`
2. Add `panConfig` to `MapSceneProps`
3. Render `<CameraController>` alongside the layer meshes

```tsx
import { MapLayerMesh } from "./MapLayerMesh";
import { CameraController } from "./CameraController";
import type { MapLayer, PanConfig } from "../types";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
}

export function MapScene({ layers, baseWidth, baseHeight, panConfig }: MapSceneProps) {
  const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
      />
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

## Step 4: Update InteractiveMap to Pass Pan Config

Update `packages/interactive-map/src/components/InteractiveMap.tsx`:

1. Import `PanConfig` type
2. Accept `panConfig` prop
3. Apply defaults and pass to `MapScene`
4. Add `cursor: "grab"` to the container div style

```tsx
// Add to imports:
import type { InteractiveMapProps, PanConfig } from "../types";

// Inside the component, before the return:
const resolvedPanConfig: Required<PanConfig> = {
  enabled: panConfig?.enabled ?? true,
  easingFactor: panConfig?.easingFactor ?? 0.15,
};

// Update the container div style:
<div style={{ width, height, cursor: resolvedPanConfig.enabled ? "grab" : "default" }} className={className}>

// Pass to MapScene:
<MapScene
  layers={layers}
  baseWidth={baseSize.width}
  baseHeight={baseSize.height}
  panConfig={resolvedPanConfig}
/>
```

## Step 5: Update Barrel Exports

Update `packages/interactive-map/src/index.ts` to export the new type:

```ts
export { InteractiveMap } from "./components/InteractiveMap";
export type { InteractiveMapProps, MapLayer, PanConfig } from "./types";
```

## Step 6: Update Demo App

Update `apps/demo/src/app/page.tsx` to demonstrate pan config (optional, since defaults work):

```tsx
import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  { id: "overlay", src: "/overlay.png", zIndex: 1 },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
      />
    </main>
  );
}
```

> **Note:** At zoom=1, panning will be locked to center by the boundary system. This is expected. Pan will become functional once zoom is implemented in Chunk 4. The demo here verifies that the pan system initializes without errors and the cursor feedback is visible.

## Step 7: Verify

1. Run `pnpm dev` from the repo root
2. Open `http://localhost:3000` in a browser
3. Verify:
   - The map renders as before (no visual regressions from Chunk 2)
   - The cursor shows `grab` when hovering over the map
   - Click-dragging does **not** move the map (expected at zoom=1 — boundaries prevent it)
   - No console errors related to pointer events or camera updates
   - Touch events do not cause errors on mobile/dev tools touch simulation
4. Run `pnpm --filter @interactive-map/core tsc --noEmit` — no TypeScript errors

### Testing Pan Actually Works (Optional Verification)

To visually verify panning works before zoom is implemented, temporarily modify the camera frustum in `InteractiveMap.tsx` to simulate a zoomed-in view:

```tsx
// Temporarily change:
const halfW = baseSize.width / 2;
const halfH = baseSize.height / 2;
// To:
const halfW = baseSize.width / 4;  // Shows only half the image width
const halfH = baseSize.height / 4; // Shows only half the image height
```

With this change, you should be able to:
- Click-drag to pan around the map
- See the camera smoothly lerp to the new position
- Hit boundaries at the edges (no empty space beyond the image)
- Test touch drag in browser dev tools mobile simulation

**Revert this change after testing.** The zoom chunk will handle this properly.

# Acceptance Criteria

- [ ] `PanConfig` type is exported from the package
- [ ] `CameraController` component handles pointer events (mouse + touch via unified pointer API)
- [ ] Screen-space drag deltas are correctly converted to world-space camera movement
- [ ] Camera position smoothly lerps toward the target with configurable easing factor
- [ ] Boundary clamping prevents empty space from being visible (base image always fills viewport)
- [ ] At zoom=1, pan is naturally locked to center (no movement possible)
- [ ] Pan can be disabled via `panConfig.enabled = false`
- [ ] Cursor shows `grab` when pan is enabled
- [ ] No regressions to existing layer rendering from Chunk 2
- [ ] TypeScript compiles with no errors (`tsc --noEmit`)
- [ ] No console errors during pointer interactions

# Review Fixes

The following bugs were found during code review. Fix all of them on the existing branch.

## Fix 1 (Critical): Switch from `unprojectedPoint` to screen-space drag deltas

**File:** `packages/interactive-map/src/components/CameraController.tsx`

**Problem:** The drag delta is computed using `event.unprojectedPoint`, which gives world-space coordinates relative to the **current camera position**. Since the camera lerps toward the target between frames, `previousWorldPoint` (stored from frame N) and `currentWorldPoint` (computed in frame N+1) are in different camera reference frames. This creates a feedback loop where the target position gets pulled back each frame, making pan sluggish and settling at a fraction of the intended displacement.

**Fix:** Use screen-space pixel coordinates (`event.nativeEvent.clientX/Y`) for drag delta calculation, then convert to world units using the camera frustum and canvas size. This decouples the delta from camera position entirely.

**Changes:**

1. Get canvas size from `useThree()`:
```tsx
const { camera, size } = useThree();
```

2. Change `dragState` to store screen-space coordinates instead of world-space:
```ts
const dragState = useRef({
  isDragging: false,
  previousScreenPoint: { x: 0, y: 0 },  // was previousWorldPoint
});
```

3. In `handlePointerDown`, store screen position:
```tsx
const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
  if (!panConfig.enabled) return;
  event.stopPropagation();
  dragState.current.isDragging = true;
  dragState.current.previousScreenPoint = {
    x: event.nativeEvent.clientX,
    y: event.nativeEvent.clientY,
  };
  // ... pointer capture
};
```

4. In `handlePointerMove`, compute delta in screen space and convert to world:
```tsx
const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
  if (!dragState.current.isDragging) return;

  const currentScreenX = event.nativeEvent.clientX;
  const currentScreenY = event.nativeEvent.clientY;

  const screenDx = currentScreenX - dragState.current.previousScreenPoint.x;
  const screenDy = currentScreenY - dragState.current.previousScreenPoint.y;

  const orthoCamera = camera as OrthographicCamera;
  const frustumWidth = orthoCamera.right - orthoCamera.left;
  const frustumHeight = orthoCamera.top - orthoCamera.bottom;

  // Convert screen pixels to world units
  // Negative X: dragging right in screen → camera moves left in world (map moves right)
  // Positive Y: dragging down in screen → camera moves up in world (Y axis flipped)
  const worldDx = -(screenDx / size.width) * frustumWidth;
  const worldDy = (screenDy / size.height) * frustumHeight;

  targetPosition.current.x += worldDx;
  targetPosition.current.y += worldDy;
  clampTarget(targetPosition.current, orthoCamera, baseWidth, baseHeight);

  dragState.current.previousScreenPoint = {
    x: currentScreenX,
    y: currentScreenY,
  };
};
```

5. Also update the section 2.2 rationale — remove the mention of `unprojectedPoint` as an advantage. The interaction mesh is still used for receiving pointer events, but coordinates come from `nativeEvent`.

## Fix 2 (Medium): Add `touch-action: none` for mobile support

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

**Problem:** On touch devices, the browser's default touch behavior (scroll, pinch-zoom the page) will compete with the canvas drag events. Without `touch-action: none`, touch drags may scroll the page instead of panning the map.

**Fix:** Add `touchAction: "none"` to the container div style:

```tsx
<div
  style={{
    width,
    height,
    cursor: resolvedPanConfig.enabled ? "grab" : "default",
    touchAction: "none",
  }}
  className={className}
>
```

## Fix 3 (Minor): Remove unnecessary `camera.updateProjectionMatrix()` call

**File:** `packages/interactive-map/src/components/CameraController.tsx`

**Problem:** `updateProjectionMatrix()` recomputes the camera frustum (left/right/top/bottom/near/far). Changing `camera.position` only affects the view matrix, which Three.js updates automatically. Calling `updateProjectionMatrix()` every frame is redundant computation.

**Fix:** Remove `camera.updateProjectionMatrix()` from the `useFrame` callback. This call will be needed in Chunk 4 when zoom changes the frustum, but not for position-only updates.

```tsx
useFrame(() => {
  const dx = targetPosition.current.x - camera.position.x;
  const dy = targetPosition.current.y - camera.position.y;

  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;

  camera.position.x += dx * panConfig.easingFactor;
  camera.position.y += dy * panConfig.easingFactor;
});
```

Also adds a threshold check (`< 0.01`) to skip updates when the camera is effectively at the target, avoiding unnecessary work when idle.

# Log
- **2026-02-18**: Plan created for Chunk 3 — Pan Controls covering pointer event handling, world-space conversion, smooth camera lerp, boundary clamping, and pan configuration. Pan is bounded so no empty space is visible. At zoom=1, boundaries naturally prevent movement; pan becomes active once zoom is added in Chunk 4.
- **2026-02-18**: Review fixes added — (1) Critical: switch from unprojectedPoint to screen-space delta to fix camera lerp feedback loop, (2) Medium: add touch-action:none for mobile, (3) Minor: remove unnecessary updateProjectionMatrix and add idle threshold.
