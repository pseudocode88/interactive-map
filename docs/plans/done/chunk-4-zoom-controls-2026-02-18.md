---
Name: Chunk 4 - Zoom Controls
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18 (Review Fixes)
---

# Brief
Implement zoom controls for the interactive map — scroll-wheel zoom on desktop and pinch-to-zoom on touch devices. Zoom is toward the pointer/pinch midpoint (Google Maps style). The orthographic camera frustum scales to achieve zoom. Pan boundaries update dynamically based on the current zoom level (already handled by existing `clampTarget` since it reads frustum size). Zoom range is bounded and configurable.

# Plan & Instruction

## Step 1: Add ZoomConfig Type

Update `packages/interactive-map/src/types/index.ts`.

Add a new `ZoomConfig` interface and update `InteractiveMapProps`:

```ts
export interface ZoomConfig {
  enabled?: boolean;       // default: true
  minZoom?: number;        // default: 1 (base image fills viewport width)
  maxZoom?: number;        // default: 3 (3x magnification)
  initialZoom?: number;    // default: 1
  scrollSpeed?: number;    // multiplier for wheel delta, default: 0.001
  easingFactor?: number;   // lerp factor for zoom animation, default: 0.15
}
```

Update `InteractiveMapProps`:

```ts
export interface InteractiveMapProps {
  layers: MapLayer[];
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
  zoomConfig?: ZoomConfig;  // NEW
}
```

Keep `MapLayer` and `PanConfig` unchanged.

## Step 2: Update CameraController

Update `packages/interactive-map/src/components/CameraController.tsx`.

This is the main implementation step. The CameraController gains zoom state, wheel handling, pinch-to-zoom, frustum updates, and an improved interaction mesh.

### 2.1 Updated Props

```ts
interface CameraControllerProps {
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;  // NEW
}
```

### 2.2 Zoom State Refs

Add alongside existing refs:

```ts
const targetZoom = useRef<number>(zoomConfig.initialZoom);
const currentZoom = useRef<number>(zoomConfig.initialZoom);
```

`targetZoom` is the desired zoom level (set by user interaction). `currentZoom` is the actual zoom level that lerps toward `targetZoom` each frame.

### 2.3 Compute Base Frustum Half-Dimensions

On mount, capture the base frustum dimensions (zoom=1 values). These are used as the reference for scaling.

```ts
const baseFrustumHalfWidth = baseWidth / 2;
```

The aspect ratio comes from the camera's initial frustum:

```ts
const { camera, size, gl } = useThree();
const orthoCamera = camera as OrthographicCamera;
const aspectRatio = size.height / size.width;
const baseFrustumHalfHeight = baseFrustumHalfWidth * aspectRatio;
```

At any zoom level Z, the frustum half-dimensions are:
- `halfW = baseFrustumHalfWidth / Z`
- `halfH = baseFrustumHalfHeight / Z`

### 2.4 Wheel Event Handler (Zoom Toward Pointer)

R3F meshes do **not** support `onWheel`. Attach a DOM `wheel` listener to the canvas element via `gl.domElement`.

Use `useEffect` to add/remove the listener:

```ts
useEffect(() => {
  if (!zoomConfig.enabled) return;

  const canvas = gl.domElement;

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();

    const oldZoom = targetZoom.current;
    const scaleFactor = 1 - event.deltaY * zoomConfig.scrollSpeed;
    const newZoom = Math.max(
      zoomConfig.minZoom,
      Math.min(zoomConfig.maxZoom, oldZoom * scaleFactor)
    );
    targetZoom.current = newZoom;

    // --- Zoom toward pointer ---
    // Compute pointer NDC (normalized device coordinates)
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    // Frustum half-dimensions at old and new zoom
    const oldHalfW = baseFrustumHalfWidth / oldZoom;
    const oldHalfH = baseFrustumHalfHeight / oldZoom;
    const newHalfW = baseFrustumHalfWidth / newZoom;
    const newHalfH = baseFrustumHalfHeight / newZoom;

    // Shift target position so the world point under the cursor stays fixed
    // Derivation:
    //   worldPoint = camPos + ndc * oldHalf
    //   worldPoint = newCamPos + ndc * newHalf
    //   newCamPos = camPos + ndc * (oldHalf - newHalf)
    targetPosition.current.x += ndcX * (oldHalfW - newHalfW);
    targetPosition.current.y += ndcY * (oldHalfH - newHalfH);

    // Re-clamp pan boundaries for the new zoom level
    // Use newHalf values to compute what the frustum will be
    clampTargetForZoom(
      targetPosition.current,
      newHalfW * 2,
      newHalfH * 2,
      baseWidth,
      baseHeight
    );
  };

  canvas.addEventListener("wheel", handleWheel, { passive: false });
  return () => canvas.removeEventListener("wheel", handleWheel);
}, [zoomConfig.enabled, zoomConfig.scrollSpeed, zoomConfig.minZoom, zoomConfig.maxZoom]);
```

**Why `{ passive: false }`:** We must call `event.preventDefault()` to prevent the page from scrolling when the user scrolls over the map. Passive listeners cannot call `preventDefault`.

### 2.5 Zoom-Aware Clamping Helper

The existing `clampTarget` reads frustum from the camera object, which only reflects the *current* (lerping) frustum. When setting the target after a zoom change, we need to clamp against the *target* frustum. Add a variant:

```ts
function clampTargetForZoom(
  target: Point,
  visibleWidth: number,
  visibleHeight: number,
  baseWidth: number,
  baseHeight: number
) {
  const minX = -baseWidth / 2 + visibleWidth / 2;
  const maxX = baseWidth / 2 - visibleWidth / 2;
  const minY = -baseHeight / 2 + visibleHeight / 2;
  const maxY = baseHeight / 2 - visibleHeight / 2;

  target.x = minX >= maxX ? 0 : Math.max(minX, Math.min(maxX, target.x));
  target.y = minY >= maxY ? 0 : Math.max(minY, Math.min(maxY, target.y));
}
```

The original `clampTarget` can be refactored to call this internally:

```ts
function clampTarget(
  target: Point,
  camera: OrthographicCamera,
  baseWidth: number,
  baseHeight: number
) {
  const visibleWidth = camera.right - camera.left;
  const visibleHeight = camera.top - camera.bottom;
  clampTargetForZoom(target, visibleWidth, visibleHeight, baseWidth, baseHeight);
}
```

### 2.6 Pinch-to-Zoom (Multi-Pointer Tracking)

Replace the single-pointer drag tracking with a multi-pointer system. Track all active pointers in a `Map<number, Point>`.

**New state refs:**

```ts
const pointers = useRef<Map<number, Point>>(new Map());
const pinchState = useRef({
  isPinching: false,
  initialDistance: 0,
  initialZoom: 1,
});
```

**Helper — distance between two points:**

```ts
function getDistance(p1: Point, p2: Point): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}
```

**Updated pointer handlers:**

**onPointerDown:**
```ts
const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
  event.stopPropagation();
  capturePointer(event);

  const screenPoint = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
  pointers.current.set(event.pointerId, screenPoint);

  if (pointers.current.size === 2 && zoomConfig.enabled) {
    // Start pinch — cancel any active pan drag
    dragState.current.isDragging = false;
    const [p1, p2] = Array.from(pointers.current.values());
    pinchState.current = {
      isPinching: true,
      initialDistance: getDistance(p1, p2),
      initialZoom: targetZoom.current,
    };
  } else if (pointers.current.size === 1 && panConfig.enabled) {
    // Start pan drag
    dragState.current.isDragging = true;
    dragState.current.previousScreenPoint = screenPoint;
  }
};
```

**onPointerMove:**
```ts
const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
  const screenPoint = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY };
  pointers.current.set(event.pointerId, screenPoint);

  if (pinchState.current.isPinching && pointers.current.size === 2) {
    const [p1, p2] = Array.from(pointers.current.values());
    const currentDistance = getDistance(p1, p2);
    const scale = currentDistance / pinchState.current.initialDistance;

    const oldZoom = targetZoom.current;
    const newZoom = Math.max(
      zoomConfig.minZoom,
      Math.min(zoomConfig.maxZoom, pinchState.current.initialZoom * scale)
    );
    targetZoom.current = newZoom;

    // Zoom toward pinch midpoint
    const midpoint = getMidpoint(p1, p2);
    const canvas = gl.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((midpoint.x - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((midpoint.y - rect.top) / rect.height) * 2 - 1);

    const oldHalfW = baseFrustumHalfWidth / oldZoom;
    const oldHalfH = baseFrustumHalfHeight / oldZoom;
    const newHalfW = baseFrustumHalfWidth / newZoom;
    const newHalfH = baseFrustumHalfHeight / newZoom;

    targetPosition.current.x += ndcX * (oldHalfW - newHalfW);
    targetPosition.current.y += ndcY * (oldHalfH - newHalfH);

    clampTargetForZoom(
      targetPosition.current,
      newHalfW * 2,
      newHalfH * 2,
      baseWidth,
      baseHeight
    );
    return;
  }

  if (dragState.current.isDragging) {
    // Existing pan logic (unchanged from Chunk 3)
    const currentScreenX = event.nativeEvent.clientX;
    const currentScreenY = event.nativeEvent.clientY;
    const screenDx = currentScreenX - dragState.current.previousScreenPoint.x;
    const screenDy = currentScreenY - dragState.current.previousScreenPoint.y;

    const frustumWidth = orthoCamera.right - orthoCamera.left;
    const frustumHeight = orthoCamera.top - orthoCamera.bottom;

    const worldDx = -(screenDx / size.width) * frustumWidth;
    const worldDy = (screenDy / size.height) * frustumHeight;

    targetPosition.current.x += worldDx;
    targetPosition.current.y += worldDy;
    clampTarget(targetPosition.current, orthoCamera, baseWidth, baseHeight);

    dragState.current.previousScreenPoint = { x: currentScreenX, y: currentScreenY };
  }
};
```

**onPointerUp / onPointerLeave:**
```ts
const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
  releasePointer(event);
  pointers.current.delete(event.pointerId);

  if (pinchState.current.isPinching) {
    pinchState.current.isPinching = false;

    // If one finger remains, transition to pan drag
    if (pointers.current.size === 1 && panConfig.enabled) {
      const remaining = Array.from(pointers.current.values())[0];
      dragState.current.isDragging = true;
      dragState.current.previousScreenPoint = remaining;
    }
  }

  if (pointers.current.size === 0) {
    dragState.current.isDragging = false;
  }
};
```

### 2.7 Updated useFrame — Zoom Lerp & Frustum Update

```ts
useFrame(() => {
  // --- Zoom lerp ---
  const zoomDiff = targetZoom.current - currentZoom.current;
  if (Math.abs(zoomDiff) > 0.001) {
    currentZoom.current += zoomDiff * zoomConfig.easingFactor;

    // Update frustum
    const halfW = baseFrustumHalfWidth / currentZoom.current;
    const halfH = baseFrustumHalfHeight / currentZoom.current;
    orthoCamera.left = -halfW;
    orthoCamera.right = halfW;
    orthoCamera.top = halfH;
    orthoCamera.bottom = -halfH;
    orthoCamera.updateProjectionMatrix();
  }

  // --- Pan lerp (existing, unchanged) ---
  const dx = targetPosition.current.x - camera.position.x;
  const dy = targetPosition.current.y - camera.position.y;

  if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
    camera.position.x += dx * panConfig.easingFactor;
    camera.position.y += dy * panConfig.easingFactor;
  }
});
```

**Key notes:**
- `camera.updateProjectionMatrix()` is now called when zoom changes (frustum is modified). It was intentionally removed in Chunk 3 for position-only updates — now it's needed again specifically for frustum changes.
- The zoom threshold (`0.001`) is tighter than the pan threshold (`0.01`) because zoom differences are in smaller units and need precision to avoid visible jitter.

### 2.8 Fix Interaction Mesh Sizing

Currently the mesh uses `orthoCamera.right - orthoCamera.left` (viewport-sized) and is positioned at `[0, 0, 5]`. When zoomed in and panned, the viewport-sized mesh at origin won't cover the full viewport.

**Fix:** Use `[baseWidth, baseHeight]` for the mesh dimensions. This covers the entire image area. When zoomed in, the viewport is smaller than the image, so the mesh always covers the viewport (since the camera is clamped within image bounds).

```tsx
return (
  <mesh
    position={[0, 0, 5]}
    onPointerDown={handlePointerDown}
    onPointerMove={handlePointerMove}
    onPointerUp={handlePointerUp}
    onPointerLeave={handlePointerUp}
  >
    <planeGeometry args={[baseWidth, baseHeight]} />
    <meshBasicMaterial visible={false} />
  </mesh>
);
```

Remove the `interactionWidth` / `interactionHeight` computed variables — they are no longer needed.

### 2.9 Initial Zoom Application

If `initialZoom` is not 1, the frustum must be set on the first frame. The useFrame logic handles this automatically because `currentZoom` starts at `initialZoom` and the frustum is updated when the component mounts and useFrame first runs.

However, to avoid a single frame at zoom=1 before the initial zoom kicks in, set the frustum in an initialization effect:

```ts
useEffect(() => {
  const halfW = baseFrustumHalfWidth / zoomConfig.initialZoom;
  const halfH = baseFrustumHalfHeight / zoomConfig.initialZoom;
  orthoCamera.left = -halfW;
  orthoCamera.right = halfW;
  orthoCamera.top = halfH;
  orthoCamera.bottom = -halfH;
  orthoCamera.updateProjectionMatrix();
}, []);
```

This only matters when `initialZoom !== 1`.

## Step 3: Update MapScene

Update `packages/interactive-map/src/components/MapScene.tsx`.

1. Add `zoomConfig` to `MapSceneProps`
2. Pass it to `CameraController`

```tsx
import type { MapLayer, PanConfig, ZoomConfig } from "../types";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;  // NEW
}

export function MapScene({ layers, baseWidth, baseHeight, panConfig, zoomConfig }: MapSceneProps) {
  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
      />
      {sortedLayers.map((layer) => (
        <MapLayerMesh key={layer.id} src={layer.src} zIndex={layer.zIndex} position={layer.position} />
      ))}
    </>
  );
}
```

## Step 4: Update InteractiveMap

Update `packages/interactive-map/src/components/InteractiveMap.tsx`.

1. Import `ZoomConfig` type
2. Accept `zoomConfig` prop
3. Resolve defaults
4. Pass to `MapScene`

```tsx
import type { InteractiveMapProps, PanConfig, ZoomConfig } from "../types";

// Inside the component, before the return:
const resolvedZoomConfig: Required<ZoomConfig> = {
  enabled: zoomConfig?.enabled ?? true,
  minZoom: zoomConfig?.minZoom ?? 1,
  maxZoom: zoomConfig?.maxZoom ?? 3,
  initialZoom: zoomConfig?.initialZoom ?? 1,
  scrollSpeed: zoomConfig?.scrollSpeed ?? 0.001,
  easingFactor: zoomConfig?.easingFactor ?? 0.15,
};

// Pass to MapScene:
<MapScene
  layers={layers}
  baseWidth={baseSize.width}
  baseHeight={baseSize.height}
  panConfig={resolvedPanConfig}
  zoomConfig={resolvedZoomConfig}
/>
```

## Step 5: Update Barrel Exports

Update `packages/interactive-map/src/index.ts` to export the new type:

```ts
export { InteractiveMap } from "./components/InteractiveMap";
export type { InteractiveMapProps, MapLayer, PanConfig, ZoomConfig } from "./types";
```

## Step 6: Update Demo App

Update `apps/demo/src/app/page.tsx` to demonstrate zoom:

```tsx
import { InteractiveMap } from "@interactive-map/core";

const layers = [
  { id: "base", src: "/base-map.png", zIndex: 0 },
  { id: "overlay", src: "/overlay.png", zIndex: 1, position: { x: 0, y: -50 } },
];

export default function Home() {
  return (
    <main style={{ width: "100vw", height: "100vh", background: "#81D4E7" }}>
      <InteractiveMap
        layers={layers}
        panConfig={{ enabled: true, easingFactor: 0.15 }}
        zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 3 }}
      />
    </main>
  );
}
```

## Step 7: Verify

1. Run `pnpm dev` from the repo root
2. Open `http://localhost:3000` in a browser
3. Verify:
   - **Scroll zoom:** Mouse wheel zooms in/out smoothly
   - **Zoom toward pointer:** The point under the cursor stays fixed during zoom (test by zooming with cursor at different positions — top-left, center, bottom-right)
   - **Zoom bounds:** Cannot zoom below `minZoom` (1) or above `maxZoom` (3)
   - **Pan after zoom:** When zoomed in, click-drag panning works and respects boundaries (no empty space visible)
   - **Pan boundaries update:** At zoom=1 pan is locked; at zoom>1 pan is available proportional to zoom level
   - **Smooth animation:** Both zoom and pan transitions use easing (no instant jumps)
   - **Pinch-to-zoom (mobile):** Open dev tools → toggle device toolbar → use pinch gesture simulation. Verify zoom works and is centered on pinch midpoint
   - **Pinch-to-pan transition:** After pinch, lifting one finger and dragging with the remaining finger should seamlessly transition to panning
   - **No page scroll:** Scrolling over the map should NOT scroll the page
   - **Layers unaffected:** All map layers render correctly at all zoom levels
   - **No console errors**
4. Run `pnpm --filter @interactive-map/core tsc --noEmit` — no TypeScript errors

# Acceptance Criteria

- [ ] `ZoomConfig` type is exported from the package
- [ ] Scroll-wheel zooms in/out with smooth easing
- [ ] Zoom is toward the pointer position (point under cursor stays fixed)
- [ ] Pinch-to-zoom works on touch devices, centered on pinch midpoint
- [ ] Pinch-to-pan transition works (lift one finger → pan with remaining finger)
- [ ] Zoom is bounded between `minZoom` and `maxZoom`
- [ ] `initialZoom` is applied on mount without a flash at zoom=1
- [ ] `scrollSpeed` controls zoom sensitivity
- [ ] Pan boundaries update dynamically based on current zoom level
- [ ] At zoom=1, pan is locked to center (existing behavior preserved)
- [ ] Page does not scroll when wheeling over the map (`preventDefault` on wheel)
- [ ] Zoom can be disabled via `zoomConfig.enabled = false`
- [ ] No regressions to pan controls from Chunk 3
- [ ] No regressions to layer rendering from Chunk 2
- [ ] TypeScript compiles with no errors (`tsc --noEmit`)
- [ ] No console errors during interactions

# Review Fixes

The following bugs were found during code review. Fix all of them on the existing branch.

## Fix 1 (Medium): Container resize resets zoom level

**File:** `packages/interactive-map/src/components/CameraController.tsx`

**Problem:** The initialization `useEffect` (lines 99–125) has `baseFrustumHalfHeight` in its dependency array. Since `baseFrustumHalfHeight` is derived from `size.height / size.width` (recomputed every render), any container resize triggers this effect — which resets `currentZoom` and `targetZoom` back to `initialZoom`. This means if a user zooms to 2x and then resizes the browser window, their zoom snaps back to 1x.

The effect correctly needs to run on resize to update the frustum for the new aspect ratio, but it should **not** reset the zoom level.

**Fix:** Split the single `useEffect` into two separate effects:

1. **Mount/initialZoom effect** — only resets zoom when `initialZoom` prop changes:
```ts
useEffect(() => {
  currentZoom.current = zoomConfig.initialZoom;
  targetZoom.current = zoomConfig.initialZoom;
}, [zoomConfig.initialZoom]);
```

2. **Resize effect** — updates frustum at the **current** zoom level (not initialZoom):
```ts
useEffect(() => {
  const halfW = baseFrustumHalfWidth / currentZoom.current;
  const halfH = baseFrustumHalfHeight / currentZoom.current;
  orthoCamera.left = -halfW;
  orthoCamera.right = halfW;
  orthoCamera.top = halfH;
  orthoCamera.bottom = -halfH;
  orthoCamera.updateProjectionMatrix();

  clampTargetForZoom(
    targetPosition.current,
    halfW * 2,
    halfH * 2,
    baseWidth,
    baseHeight
  );
}, [baseFrustumHalfHeight, baseFrustumHalfWidth, baseHeight, baseWidth, orthoCamera]);
```

This ensures:
- Frustum updates correctly on container resize at the current zoom level
- Zoom only resets when the `initialZoom` prop actually changes (or on mount)
- Base image change (`baseWidth`/`baseHeight` change) updates frustum without resetting zoom

## Fix 2 (Minor): Three-finger touch causes zoom jump

**File:** `packages/interactive-map/src/components/CameraController.tsx`

**Problem:** If a 3rd finger touches down, `pointers.current.size` becomes 3. Neither the pinch branch (`=== 2`) nor the pan branch (`=== 1`) matches, so the 3rd finger is silently tracked. `pinchState.current.isPinching` remains `true` from the original 2-finger pinch. When the 3rd finger lifts, `pointers.current.size` returns to 2, and pinch resumes — but with the stale `initialDistance` and `initialZoom` from when the original 2-finger pinch started. The distance between the remaining two fingers may be very different from `initialDistance`, causing a **zoom jump**.

**Fix:** In `handlePointerUp`, after `pointers.current.delete(event.pointerId)`, add a pinch baseline reset when re-entering the 2-pointer state:

```ts
const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
  releasePointer(event);
  pointers.current.delete(event.pointerId);

  if (pinchState.current.isPinching) {
    // Re-entering 2-pointer state after 3+ fingers — reset pinch baseline
    if (pointers.current.size === 2) {
      const [p1, p2] = Array.from(pointers.current.values());
      pinchState.current.initialDistance = getDistance(p1, p2);
      pinchState.current.initialZoom = targetZoom.current;
      return;
    }

    pinchState.current.isPinching = false;

    // If one finger remains, transition to pan drag
    if (pointers.current.size === 1 && panConfig.enabled) {
      const remaining = Array.from(pointers.current.values())[0];
      dragState.current.isDragging = true;
      dragState.current.previousScreenPoint = remaining;
    }
  }

  if (pointers.current.size === 0) {
    dragState.current.isDragging = false;
  }
};
```

The key change: when a finger lifts but 2 fingers remain and we're still pinching, reset the baseline (`initialDistance` and `initialZoom`) to the current state. This prevents a jump because the next pinch move will compute scale relative to the current finger positions and current zoom.

# Log
- **2026-02-18**: Plan created for Chunk 4 — Zoom Controls covering scroll-wheel zoom, pinch-to-zoom, zoom-toward-pointer math, frustum scaling, multi-pointer tracking, dynamic pan boundary updates, and configurable zoom range/speed/easing.
- **2026-02-18**: Review fixes added — (1) Medium: split init useEffect to prevent container resize from resetting zoom level, (2) Minor: reset pinch baseline on 3-finger → 2-finger transition to prevent zoom jump.
