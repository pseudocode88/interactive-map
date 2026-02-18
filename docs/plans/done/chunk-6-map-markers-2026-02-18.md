---
Name: Chunk 6 - Map Markers & Interaction
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18
Review Status: Approved
---

# Brief
Add interactive markers to the map that are positioned relative to the base image. Markers render as pulsing glowing dots by default but support custom React components. Clicking a marker fires a callback with its ID and smoothly zooms to that point. A reset prop allows the parent to zoom back out. Markers live on a dedicated layer just above the base map and include hover effects (scale up + tooltip).

# Plan & Instruction

## Step 1: Define Marker Types

**File:** `packages/interactive-map/src/types/index.ts`

Add the following types:

```ts
interface MapMarker {
  id: string;
  /** X position in base image pixel coordinates (0 = left edge) */
  x: number;
  /** Y position in base image pixel coordinates (0 = top edge) */
  y: number;
  /** Text shown in tooltip on hover */
  label: string;
  /** Marker dot color (CSS color string). Default: "#ff4444" */
  color?: string;
}
```

Update `InteractiveMapProps` to add:

```ts
interface InteractiveMapProps {
  // ... existing props ...
  /** Array of markers to display on the map */
  markers?: MapMarker[];
  /** Called when a marker is clicked. Receives the marker ID. */
  onMarkerClick?: (markerId: string) => void;
  /**
   * Custom render function for marker visuals. Receives the marker data.
   * If not provided, the default pulsing dot is used.
   * The returned element replaces ONLY the dot visual, not the tooltip.
   */
  renderMarker?: (marker: MapMarker) => React.ReactNode;
  /**
   * Increment this number to trigger a zoom reset (zooms out to initialZoom).
   * Pan position is preserved. E.g. set to Date.now() or a counter.
   */
  resetZoomTrigger?: number;
}
```

Export `MapMarker` from `packages/interactive-map/src/index.ts`.

---

## Step 2: Create Default Marker Component

**File (new):** `packages/interactive-map/src/components/DefaultMarker.tsx`

A pure CSS/HTML marker component rendered via Drei's `<Html>` component.

**Visual spec:**
- A 14px diameter circle filled with the marker's `color` prop
- An outer glow ring (same color, 50% opacity) that pulses (scales from 1x to 2x and fades out) on a 1.5s infinite CSS animation
- Uses `pointer-events: auto` so hover/click work

**CSS approach:**
- Use inline styles or a `<style>` tag injected once (prefer inline styles for simplicity since this is a Three.js overlay)
- The pulsing glow is a separate `<div>` behind the dot using a CSS `@keyframes` animation
- Use a wrapper div with `position: relative` to anchor both the dot and the glow ring

**Hover behavior:**
- On hover, scale the entire marker to 1.3x using CSS `transform: scale(1.3)` with a 150ms transition
- Show a tooltip `<div>` positioned above the marker (bottom: 100%, centered horizontally)
- Tooltip styling: dark background (`rgba(0,0,0,0.8)`), white text, 12px font, 4px 8px padding, border-radius 4px, small arrow/triangle pointing down
- Tooltip shows the `label` string, truncated with ellipsis at 200px max-width
- Tooltip hidden by default, shown on hover via CSS (parent:hover > tooltip `opacity: 1`)

**Props for this component:**
```ts
interface DefaultMarkerProps {
  color: string;
  label: string;
  isHovered: boolean;
}
```

Manage hover state internally with `onPointerEnter`/`onPointerLeave` on the wrapper div.

---

## Step 3: Create MarkerLayer Component

**File (new):** `packages/interactive-map/src/components/MarkerLayer.tsx`

This component renders all markers using Drei's `<Html>` to project HTML elements into the Three.js scene at world coordinates.

**Props:**
```ts
interface MarkerLayerProps {
  markers: MapMarker[];
  baseImageWidth: number;
  baseImageHeight: number;
  onMarkerClick: (markerId: string) => void;
  renderMarker?: (marker: MapMarker) => React.ReactNode;
}
```

**Coordinate conversion:**
- The world coordinate system has (0,0) at center, with the base image spanning from `(-baseImageWidth/2, -baseImageHeight/2)` to `(baseImageWidth/2, baseImageHeight/2)`
- Y-axis is inverted (Three.js Y goes up, image Y goes down)
- Convert marker pixel coords to world coords:
  ```
  worldX = marker.x - (baseImageWidth / 2)
  worldY = (baseImageHeight / 2) - marker.y
  ```

**Rendering:**
- Render a single `<group>` with z-position calculated to sit just above the base layer. Use the base layer's zIndex `* 0.01 + 0.005` (halfway between base and next layer in z-space)
- For each marker, render a Drei `<Html>` component:
  - `position={[worldX, worldY, 0]}` (local to the group)
  - `center` prop to center the HTML on the 3D point
  - `zIndexRange={[50, 0]}` to keep markers above other HTML if any
  - `style={{ pointerEvents: 'auto' }}`
  - `prepend={false}` to render on top
- Inside each `<Html>`:
  - A click handler div wrapping the visual:
    - On click: calls `onMarkerClick(marker.id)`
    - `cursor: pointer`
  - If `renderMarker` is provided, call it for the visual; otherwise render `<DefaultMarker>`
  - The tooltip is always rendered by `MarkerLayer` (not inside custom renderMarker) so tooltips work consistently

**Important:** `<Html>` from Drei automatically handles projection from world space to screen space, and updates on camera changes. Markers will naturally move with pan and scale with zoom.

**Zoom compensation for marker size:**
- Markers should stay the same visual size on screen regardless of zoom level
- Read the current camera zoom from `useThree()` and apply an inverse scale CSS transform: `transform: scale(${1/zoom})` on the wrapper div
- Update this in a `useFrame` callback by writing to a ref'd div's style directly (avoid React re-renders)

---

## Step 4: Add Programmatic Zoom Control to CameraController

**File:** `packages/interactive-map/src/components/CameraController.tsx`

### 4a: Add zoom-to-point capability

Add new props to `CameraControllerProps`:

```ts
interface CameraControllerProps {
  // ... existing props ...
  /** When set, camera smoothly animates to this point at maxZoom. Set to null to clear. */
  focusTarget?: { x: number; y: number } | null;
  /** Called when the camera finishes animating to a focus target */
  onFocusComplete?: () => void;
  /** Increment to trigger a zoom reset to initialZoom. Pan position is preserved. */
  resetZoomTrigger?: number;
}
```

**Focus target implementation:**
- When `focusTarget` changes from null to a value:
  - Set `targetPosition.current` to `{ x: focusTarget.x, y: focusTarget.y }`
  - Set `targetZoom.current` to `zoomConfig.maxZoom` (or default 3)
  - The existing `useFrame` lerp loop will smoothly animate to this position
  - Track a `isFocusing` ref. On each frame, check if current zoom and position are within a small epsilon of target. When reached, call `onFocusComplete()` and set `isFocusing` to false

**Important:** While focusing, user input (pan/drag/scroll) should interrupt the focus animation. If the user interacts during a focus animation:
- Set `isFocusing` ref to false
- Do NOT call `onFocusComplete`
- Allow normal input to take over

### 4b: Add reset zoom capability

- Track `resetZoomTrigger` prop with a `useEffect`:
  ```ts
  const prevResetTrigger = useRef(resetZoomTrigger);
  useEffect(() => {
    if (resetZoomTrigger !== prevResetTrigger.current) {
      prevResetTrigger.current = resetZoomTrigger;
      targetZoom.current = zoomConfig.initialZoom ?? 1;
      // Do NOT change targetPosition — preserve pan
    }
  }, [resetZoomTrigger]);
  ```
- The existing lerp in `useFrame` will smoothly animate the zoom out

### 4c: Clamp focus target to pan boundaries

When setting `targetPosition` from a focus target, clamp it to the existing pan boundaries so the camera doesn't go out of bounds at the target zoom level. Reuse the existing boundary clamping logic.

---

## Step 5: Wire Everything Together in MapScene and InteractiveMap

### 5a: Update `MapScene.tsx`

**New props to accept:** `markers`, `onMarkerClick`, `renderMarker`, `focusTarget`, `onFocusComplete`, `resetZoomTrigger`

- Pass `focusTarget`, `onFocusComplete`, and `resetZoomTrigger` down to `<CameraController>`
- Render `<MarkerLayer>` after sorting layers. Position it in the component tree after the base layer mesh but the z-positioning is handled by MarkerLayer itself
- Pass `baseImageWidth`, `baseImageHeight` (from the base layer's natural dimensions) to `<MarkerLayer>`

**Focus target state management:**
- Add a `focusTarget` state: `useState<{ x: number; y: number } | null>(null)`
- Pass a `handleMarkerClick` function to `<MarkerLayer>`:
  - Converts the clicked marker's image-pixel position to world coords
  - Sets `focusTarget` to those world coords
  - Calls the user's `onMarkerClick` callback with the marker ID
- `onFocusComplete` callback clears `focusTarget` back to null

### 5b: Update `InteractiveMap.tsx`

- Accept and pass through the new props: `markers`, `onMarkerClick`, `renderMarker`, `resetZoomTrigger`
- Pass them down to `<MapScene>`

---

## Step 6: Update Public Exports

**File:** `packages/interactive-map/src/index.ts`

- Export `MapMarker` type
- The updated `InteractiveMapProps` is already exported (just has new optional fields)

---

## Step 7: Update Demo App

**File:** `apps/demo/src/app/page.tsx`

Add sample markers to demonstrate the feature:

```ts
const markers: MapMarker[] = [
  { id: "castle", x: 500, y: 300, label: "Castle", color: "#ff4444" },
  { id: "village", x: 200, y: 600, label: "Village", color: "#44aaff" },
  { id: "forest", x: 800, y: 450, label: "Dark Forest", color: "#44ff88" },
];
```

- Add markers prop to `<InteractiveMap>`
- Add an `onMarkerClick` handler that logs the marker ID to console
- Add a "Reset Zoom" button that increments a `resetZoomTrigger` counter state to demonstrate the reset feature

---

## File Change Summary

| File | Action | Description |
|---|---|---|
| `packages/interactive-map/src/types/index.ts` | Modify | Add `MapMarker` type, update `InteractiveMapProps` |
| `packages/interactive-map/src/components/DefaultMarker.tsx` | Create | Default pulsing dot marker with tooltip |
| `packages/interactive-map/src/components/MarkerLayer.tsx` | Create | Renders all markers via Drei `<Html>` |
| `packages/interactive-map/src/components/CameraController.tsx` | Modify | Add focusTarget, resetZoomTrigger support |
| `packages/interactive-map/src/components/MapScene.tsx` | Modify | Wire markers and focus state |
| `packages/interactive-map/src/components/InteractiveMap.tsx` | Modify | Pass through new marker props |
| `packages/interactive-map/src/index.ts` | Modify | Export `MapMarker` type |
| `apps/demo/src/app/page.tsx` | Modify | Add sample markers and reset button |

# Acceptance Criteria

1. Markers render as pulsing glowing dots at the correct positions on the map (relative to base image pixel coordinates)
2. Marker color is configurable per-marker via the `color` prop
3. Hovering a marker scales it up slightly (1.3x) with a smooth transition and shows a tooltip with the marker's label
4. Clicking a marker fires `onMarkerClick` with the marker ID and smoothly zooms to that point at max zoom
5. User pan/scroll input during zoom animation interrupts the animation and returns to normal control
6. Incrementing `resetZoomTrigger` smoothly zooms back to initial zoom while preserving current pan position
7. Markers remain the same visual size on screen at all zoom levels (inverse-scale compensation)
8. Markers move correctly with pan and parallax (they are attached just above the base layer)
9. `renderMarker` prop allows replacing the default dot with a custom React component, while tooltip behavior is preserved
10. Demo app shows working markers with click + reset zoom button

# Review Fixes

## Fix 1: Clear `focusTarget` on interruption (Major)

**Files:** `CameraController.tsx`, `MapScene.tsx`

**Problem:** When the user interrupts a focus animation (drag/scroll), `isFocusing` is cleared but `focusTarget` state in MapScene stays non-null. If the window resizes, the `focusTarget` useEffect re-fires with the stale target and re-animates the camera unexpectedly. This also prevents the same marker from being re-clicked reliably.

**Fix:**

1. Add `onFocusInterrupted` callback prop to `CameraControllerProps`:
   ```ts
   onFocusInterrupted?: () => void;
   ```

2. In `CameraController.tsx`, update `interruptFocus()` to notify the parent:
   ```ts
   const interruptFocus = () => {
     if (isFocusing.current) {
       isFocusing.current = false;
       onFocusInterrupted?.();
     }
   };
   ```

3. In `MapScene.tsx`, pass the callback to clear focusTarget:
   ```tsx
   <CameraController
     // ... existing props
     onFocusInterrupted={() => setFocusTarget(null)}
   />
   ```

This ensures `focusTarget` is always `null` when not actively animating, preventing spurious re-fires from dependency changes in the useEffect.

---

## Fix 2: Replace CSS transition with useFrame lerp for hover scale (Major)

**File:** `MarkerLayer.tsx`

**Problem:** The marker wrapper has `transition: "transform 150ms ease"` but `useFrame` also writes to `transform` every frame for zoom compensation (`scale(1/zoom)`). The CSS transition fights the per-frame updates, causing markers to visibly lag behind the correct size during zooming.

**Fix:**

1. Remove `transition: "transform 150ms ease"` from the wrapper div's inline styles.

2. Add a `hoverScaleRef` to `MarkerItem` and lerp it in `useFrame`:
   ```ts
   const hoverScaleRef = useRef(1);

   useFrame(() => {
     if (!markerRef.current) return;
     const targetHoverScale = isHovered ? 1.3 : 1;
     hoverScaleRef.current += (targetHoverScale - hoverScaleRef.current) * 0.2;
     const zoom = Math.max(0.001, viewportRef.current?.zoom ?? 1);
     markerRef.current.style.transform = `scale(${hoverScaleRef.current / zoom})`;
   });
   ```

3. Remove the existing separate `hoverScale` variable and the old `useFrame` transform logic since it is now consolidated into the single `useFrame` above.

---

## Fix 3: Replace Drei `<Html>` with custom DOM overlay for markers (Critical)

**Files:** `MarkerLayer.tsx`, `MapScene.tsx`, `InteractiveMap.tsx`

**Problem:** Drei's `<Html>` component performs internal frustum visibility checks — it hides elements whose projected 3D position falls outside the camera's current frustum (NDC outside [-1, 1]). This causes two bugs:

1. **"Not all markers loading"**: At zoom=1 with cover fitting, markers near the edges of the base image may sit just outside the camera frustum on one axis, so `<Html>` sets `display: none` on them.
2. **"Markers hidden on zoom"**: During focus animation, the zoom (frustum narrowing) outruns the pan (camera repositioning). The frustum narrows before the camera reaches the marker, so the marker's NDC goes outside [-1, 1] temporarily, and `<Html>` hides it. Even after the animation completes, the marker may flicker.

**Fix:** Replace Drei's `<Html>` with a **custom DOM overlay** that manually projects world positions to screen coordinates. This gives full control over visibility and avoids Drei's frustum culling.

### Implementation

1. **Add a marker overlay container in `InteractiveMap.tsx`:**
   - After the `<Canvas>`, render a `<div>` absolutely positioned over the canvas with `pointerEvents: "none"` and `overflow: "hidden"`
   - Pass a `ref` to this container div down to `MapScene` and then to `MarkerLayer`

   ```tsx
   const markerOverlayRef = useRef<HTMLDivElement>(null);

   return (
     <div ref={containerRef} style={{ ... }}>
       <Canvas orthographic ...>
         <MapScene markerOverlayRef={markerOverlayRef} ... />
       </Canvas>
       <div
         ref={markerOverlayRef}
         style={{
           position: "absolute",
           top: 0, left: 0, width: "100%", height: "100%",
           pointerEvents: "none",
           overflow: "hidden",
         }}
       />
     </div>
   );
   ```

2. **Rewrite `MarkerLayer` to use React portal + manual projection:**
   - Remove all `<Html>` usage from Drei
   - Use `createPortal` from `react-dom` to render marker HTML into the overlay container
   - In `useFrame`, for each marker:
     a. Convert marker image-pixel coords to world coords (same as before)
     b. Project world position to NDC using `camera.projectionMatrix` and `camera.matrixWorldInverse`:
        ```ts
        const vec = new THREE.Vector3(worldX, worldY, markerZ);
        vec.project(camera);
        const screenX = (vec.x * 0.5 + 0.5) * size.width;
        const screenY = (-vec.y * 0.5 + 0.5) * size.height;
        ```
     c. Set the marker div's `transform: translate(${screenX}px, ${screenY}px) scale(${hoverScale / zoom})` directly via ref
   - **Do NOT hide markers based on frustum** — let `overflow: hidden` on the container naturally clip off-screen markers

3. **Marker DOM structure** (rendered via portal):
   - One wrapper `<div>` per marker, absolutely positioned at `top: 0; left: 0` with `transform` set per-frame
   - Each wrapper contains the DefaultMarker (or custom renderMarker) + tooltip
   - Wrapper has `pointerEvents: "auto"` so click/hover work
   - Use `will-change: transform` for GPU-accelerated positioning

4. **Pass `viewportRef`** to MarkerLayer instead of relying on `<Html>`'s internal camera tracking. The MarkerLayer already has access to viewportRef via MapScene — use it for the zoom value in scale compensation.

5. **Performance:** Store marker div refs in a `useRef(Map<string, HTMLDivElement>)`. In `useFrame`, iterate the map and update each div's transform directly (no React state, no re-renders).

### Props changes

`MarkerLayerProps` adds:
```ts
overlayContainer: React.RefObject<HTMLDivElement>;
viewportRef: React.RefObject<{ x: number; y: number; zoom: number }>;
```

`MapSceneProps` adds:
```ts
markerOverlayRef: React.RefObject<HTMLDivElement>;
```

Pass `markerOverlayRef` through `InteractiveMap → MapScene → MarkerLayer`.

---

## Fix 4: Clean up injected style tag on unmount (Minor)

**File:** `DefaultMarker.tsx`

**Problem:** `ensureMarkerStyles()` appends a `<style>` element to `document.head` but never removes it when all markers unmount. In SPAs where the map mounts/unmounts, orphaned style tags persist.

**Fix:**

Add a reference counter pattern:

```ts
let styleRefCount = 0;

function mountMarkerStyles() {
  styleRefCount++;
  if (styleRefCount === 1) {
    // Create and append the <style> tag (existing logic from ensureMarkerStyles)
  }
}

function unmountMarkerStyles() {
  styleRefCount--;
  if (styleRefCount === 0) {
    const el = document.getElementById("interactive-map-marker-styles");
    if (el) el.remove();
  }
}
```

In `DefaultMarker`, call `mountMarkerStyles()` in a `useEffect` and return `unmountMarkerStyles` as cleanup:

```ts
useEffect(() => {
  mountMarkerStyles();
  return () => unmountMarkerStyles();
}, []);
```

# Review Round 2 Fixes

## Fix 5: Marker centering offset (Medium)

**File:** `MarkerLayer.tsx`

**Problem:** The marker wrapper div positions markers with `translate(screenX, screenY)` which places the top-left corner of the wrapper at the screen coordinate. The DefaultMarker's dot is centered within its 14x14 parent using `left: 50%; top: 50%; translate(-50%, -50%)`, so the visible dot appears ~7px offset from the actual world coordinate.

**Fix:**

In the `updateTransforms` rAF loop, add a `translate(-50%, -50%)` before the scale to center the wrapper on the screen point:

```ts
element.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) scale(${nextHoverScale / zoom})`;
```

This centers the wrapper element on the projected screen coordinate, so the marker dot aligns precisely with the world position.

---

## Fix 6: Remove duplicate `markersById` (Minor)

**Files:** `InteractiveMap.tsx`, `MarkerLayer.tsx`

**Problem:** `markersById` is computed via `useMemo` in both `InteractiveMap.tsx` and `MarkerLayer.tsx`. Redundant computation.

**Fix:**

1. Remove the `markersById` useMemo from `MarkerLayer.tsx`
2. Add `markersById` as a prop to `MarkerLayerProps`:
   ```ts
   markersById: Map<string, MapMarker>;
   ```
3. Pass it from `InteractiveMap.tsx` where it's already computed

---

## Fix 7: Remove dead `viewportRef` in MapScene (Minor)

**File:** `MapScene.tsx`

**Problem:** `MapScene` creates its own `viewportRef` on line 42 which is no longer consumed by any child — the MarkerLayer that used it now lives outside the Canvas in `InteractiveMap.tsx`. The ref and its assignment inside `onViewportChange` are dead code.

**Fix:**

Remove the `viewportRef` declaration and the `viewportRef.current = viewport` assignment from MapScene. The `onViewportChange` callback should just forward to the parent:

```tsx
onViewportChange={(viewport) => {
  onViewportChange?.(viewport);
}}
```

---

## Fix 8: Stabilize rAF loop by moving hover state to ref (Minor)

**File:** `MarkerLayer.tsx`

**Problem:** `hoveredMarkers` state object is in the `useEffect` dependency array for the `requestAnimationFrame` loop. Every pointer enter/leave triggers a state update which tears down and restarts the rAF loop. This causes a brief frame gap on each hover.

**Fix:**

1. Replace `hoveredMarkers` state with a ref:
   ```ts
   const hoveredMarkersRef = useRef<Record<string, boolean>>({});
   ```
2. Update pointer enter/leave handlers to write to the ref directly:
   ```ts
   onPointerEnter={() => { hoveredMarkersRef.current[marker.id] = true; }}
   onPointerLeave={() => { hoveredMarkersRef.current[marker.id] = false; }}
   ```
3. In the `updateTransforms` loop, read from `hoveredMarkersRef.current` instead of `hoveredMarkers`
4. Remove `hoveredMarkers` from the `useEffect` dependency array
5. Keep a separate `[hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null)` state **only** for triggering re-renders of the tooltip opacity (since that's controlled via inline style `opacity: isHovered ? 1 : 0`). Update this state in the pointer handlers alongside the ref write.

Alternatively, if tooltip show/hide can tolerate being driven by the rAF loop (writing to the tooltip div's style directly via ref), the state can be eliminated entirely.

---

# Review Round 3 Fixes

## Fix 9: Rewrite markers as in-canvas Three.js objects (Major — replaces Fix 3)

**Files to delete:** `MarkerLayer.tsx`, `DefaultMarker.tsx`
**Files to create:** `MarkerDot.tsx`
**Files to modify:** `InteractiveMap.tsx`, `MapScene.tsx`, `types/index.ts`, `index.ts`

**Problem:** The DOM overlay approach (Fix 3) introduced cascading issues: manual projection math, rAF sync loop, tooltip clipping from `overflow: hidden`, hover state complexity, and marker centering offsets. These stem from rendering HTML outside the Canvas and manually syncing it with the R3F camera.

**Decision:** Move markers back inside the Canvas as native Three.js objects. Drop the `renderMarker` prop (custom React component support) in favor of a simpler color/size API.

### 9a: Create `MarkerDot.tsx`

**File (new):** `packages/interactive-map/src/components/MarkerDot.tsx`

A single marker rendered as a Three.js mesh inside the R3F scene. Each marker is a small circle with a glow pulse effect. No HTML, no Drei `<Html>` — tooltip is handled by a separate global DOM tooltip (see 9b).

**Props:**
```ts
interface MarkerDotProps {
  marker: MapMarker;
  worldX: number;
  worldY: number;
  zPosition: number;
  onHoverChange: (markerId: string | null) => void;
  onClick: () => void;
}
```

**Marker dot rendering:**
- Use a `<mesh>` with `<circleGeometry args={[7, 32]}/>` (7px radius, 32 segments) for the dot
- Use `<meshBasicMaterial color={marker.color ?? "#ff4444"} />` for the fill
- Position at `[worldX, worldY, zPosition]`

**Zoom compensation (constant screen size):**
- In `useFrame`, read the camera zoom from `camera.userData.interactiveMapZoom` (already written by CameraController)
- Apply inverse scale: `meshRef.current.scale.setScalar(1 / zoom)`
- This keeps the marker the same pixel size regardless of zoom level

**Pulse/glow effect:**
- Render a second `<mesh>` (the pulse ring) as a sibling, same position, slightly larger
- In `useFrame`, animate its scale from 1x to 2x and opacity from 0.5 to 0 on a 1.5s cycle:
  ```ts
  const pulseElapsed = (elapsed % 1.5) / 1.5; // 0 → 1 over 1.5s
  const pulseScale = 1 + pulseElapsed;
  const pulseOpacity = 0.5 * (1 - pulseElapsed);
  pulseRef.current.scale.setScalar(pulseScale / zoom);
  pulseMaterial.opacity = pulseOpacity;
  ```
- The pulse ring uses the same color with `transparent: true`

**Hover and click:**
- Use R3F's native pointer events on the dot mesh: `onPointerEnter`, `onPointerLeave`, `onClick`
- Track `isHovered` locally with a ref (not state — avoids re-renders, scale is driven by `useFrame`)
- On hover, notify parent via `onHoverChange(marker.id)` / `onHoverChange(null)` — this drives the global tooltip
- On hover, scale the dot to 1.3x (multiply the zoom-compensated scale by 1.3) — apply via lerp in `useFrame` for smooth transition:
  ```ts
  const targetScale = (isHoveredRef.current ? 1.3 : 1) / zoom;
  currentScale.current += (targetScale - currentScale.current) * 0.2;
  meshRef.current.scale.setScalar(currentScale.current);
  ```
- `onClick` calls the parent's `onClick()`
- Set `cursor: "pointer"` via R3F's `onPointerOver` / `onPointerOut`:
  ```ts
  onPointerOver={() => { document.body.style.cursor = "pointer"; }}
  onPointerOut={() => { document.body.style.cursor = "auto"; }}
  ```

### 9b: Create `MarkerTooltip.tsx` — Global DOM tooltip

**File (new):** `packages/interactive-map/src/components/MarkerTooltip.tsx`

A single absolutely-positioned DOM tooltip rendered **outside** the Canvas in `InteractiveMap.tsx`. It projects the active marker's world position to screen coordinates each frame and positions itself accordingly. Zero Drei, zero `<Html>`.

**Props:**
```ts
interface MarkerTooltipProps {
  marker: MapMarker | null;
  worldX: number;
  worldY: number;
  markerZPosition: number;
  containerRef: RefObject<HTMLDivElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
}
```

**How it works:**

1. **Render a single tooltip div** absolutely positioned inside the map container. Hidden when `marker` is null.

2. **Project world position to screen coordinates** using a `requestAnimationFrame` loop:
   ```ts
   const tooltipRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
     if (!marker) return;
     let frameId = 0;

     const update = () => {
       const canvas = canvasRef.current;
       const tooltip = tooltipRef.current;
       const container = containerRef.current;
       if (!canvas || !tooltip || !container) {
         frameId = requestAnimationFrame(update);
         return;
       }

       // Read camera state from the canvas's R3F store
       // We need the camera from R3F. Options:
       //   a) Pass camera via a ref from MapScene
       //   b) Use the viewport ref that InteractiveMap already maintains
       // Option (b) is simpler — use viewportRef + baseFrustumHalfWidth/Height

       const viewport = viewportRef.current;
       const zoom = Math.max(0.001, viewport.zoom);
       const halfW = baseFrustumHalfWidth / zoom;
       const halfH = baseFrustumHalfHeight / zoom;

       const ndcX = (worldX - viewport.x) / halfW;
       const ndcY = (worldY - viewport.y) / halfH;

       const rect = container.getBoundingClientRect();
       const screenX = (ndcX * 0.5 + 0.5) * rect.width;
       const screenY = (-ndcY * 0.5 + 0.5) * rect.height;

       tooltip.style.transform = `translate(${screenX}px, ${screenY}px) translate(-50%, -100%) translateY(-12px)`;
       tooltip.style.opacity = "1";

       frameId = requestAnimationFrame(update);
     };

     frameId = requestAnimationFrame(update);
     return () => cancelAnimationFrame(frameId);
   }, [marker, worldX, worldY, ...]);
   ```

3. **Tooltip DOM structure:**
   ```tsx
   <div
     ref={tooltipRef}
     style={{
       position: "absolute",
       top: 0,
       left: 0,
       pointerEvents: "none",
       opacity: 0,
       transition: "opacity 150ms ease",
       willChange: "transform",
       zIndex: 10,
     }}
   >
     {marker && (
       <div style={{
         background: "rgba(0, 0, 0, 0.8)",
         color: "#fff",
         fontSize: 12,
         lineHeight: 1.2,
         padding: "4px 8px",
         borderRadius: 4,
         whiteSpace: "nowrap",
         maxWidth: 200,
         overflow: "hidden",
         textOverflow: "ellipsis",
       }}>
         {marker.label}
         <div style={{
           position: "absolute",
           left: "50%",
           top: "100%",
           transform: "translateX(-50%)",
           width: 0, height: 0,
           borderLeft: "5px solid transparent",
           borderRight: "5px solid transparent",
           borderTop: "5px solid rgba(0, 0, 0, 0.8)",
         }} />
       </div>
     )}
   </div>
   ```

4. **Why this is better than Drei `<Html>`:**
   - No frustum culling — tooltip is pure DOM, not tied to Three.js visibility
   - No `overflow: hidden` clipping — tooltip floats freely above the container
   - Stable during zoom animations — rAF reads viewport ref which is updated by CameraController
   - Only one DOM element regardless of marker count
   - `transition: "opacity 150ms ease"` gives a smooth show/hide without any React state churn

**Updated props (to pass viewport info without R3F camera access):**
```ts
interface MarkerTooltipProps {
  marker: MapMarker | null;
  worldX: number;
  worldY: number;
  containerRef: RefObject<HTMLDivElement>;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
}
```

### 9c: Update `MapScene.tsx`

- Accept `markers`, `onMarkerClick`, `onMarkerHoverChange`, `baseImageWidth`, `baseImageHeight` props
- Render `<MarkerDot>` components for each marker after the layer meshes
- Compute world coordinates from marker image-pixel coords using the same formula:
  ```ts
  worldX = marker.x - baseImageWidth / 2
  worldY = baseImageHeight / 2 - marker.y
  ```
- Set marker z-position to sit just above the base layer: `0.005` (between zIndex 0 and 1 in the `zIndex * 0.01` scheme)
- Pass `onHoverChange` and `onClick` to each `<MarkerDot>`

### 9d: Update `InteractiveMap.tsx`

- Remove the `<MarkerLayer>` DOM overlay and all its wiring (`markersById` for MarkerLayer, the overlay `<div>`)
- Remove `renderMarker` from destructured props
- Add `hoveredMarkerId` state: `useState<string | null>(null)`
- Compute `hoveredMarker` and its world coords from `hoveredMarkerId` + `markersById`:
  ```ts
  const hoveredMarker = hoveredMarkerId ? markersById.get(hoveredMarkerId) ?? null : null;
  const hoveredWorldX = hoveredMarker ? hoveredMarker.x - baseSize.width / 2 : 0;
  const hoveredWorldY = hoveredMarker ? baseSize.height / 2 - hoveredMarker.y : 0;
  ```
- Pass `markers`, `onMarkerClick`, `onMarkerHoverChange` down to `<MapScene>`
- After the `<Canvas>`, render `<MarkerTooltip>`:
  ```tsx
  <MarkerTooltip
    marker={hoveredMarker}
    worldX={hoveredWorldX}
    worldY={hoveredWorldY}
    containerRef={containerRef}
    viewportRef={viewportRef}
    baseFrustumHalfWidth={halfWidth}
    baseFrustumHalfHeight={halfHeight}
  />
  ```
- Keep `focusTarget`, `onFocusComplete`, `onFocusInterrupted`, `resetZoomTrigger` — these still work through CameraController
- Keep `viewportRef` — now used by both marker click (focus target) and tooltip positioning

### 9e: Update `types/index.ts`

- Remove `renderMarker` from `InteractiveMapProps`
- Keep everything else unchanged (`markers`, `onMarkerClick`, `resetZoomTrigger`, `MapMarker`)

### 9f: Update `index.ts`

- No changes expected (DefaultMarker was never exported)

### 9g: Delete old files

- Delete `packages/interactive-map/src/components/MarkerLayer.tsx`
- Delete `packages/interactive-map/src/components/DefaultMarker.tsx`

---

## Fix 10: Cloud layer edge visible on zoom reset (Medium)

**File:** `MapLayerMesh.tsx`

**Problem:** The carousel animation translates a single mesh across the screen. The mesh geometry is exactly `textureWidth × textureHeight` — there is no tiling or duplication. When zoomed in, the narrow frustum hides the image edges. On zoom reset (or at `initialZoom: 1`), the frustum widens and the cloud image boundary becomes visible as a hard rectangular edge (visible in the right side of the screenshot).

This is a pre-existing carousel limitation exposed by the zoom reset feature. The `cloud-slide-front.png` and `cloud-slide-front-2.png` images are smaller than the base map, so a single copy cannot cover the full visible width at all zoom levels.

**Fix:**

Duplicate the carousel mesh so the image tiles seamlessly. When a carousel animation is active, render **two copies** of the mesh offset by one image-width apart in the scroll direction. As one copy scrolls off-screen, the other fills the gap.

### Implementation

1. In `MapLayerMesh.tsx`, detect if the layer has a `carousel` animation:
   ```ts
   const hasCarousel = (animation ?? []).some((a) => a.type === "carousel");
   ```

2. If `hasCarousel` is true, find the carousel's normalized direction vector and compute an offset equal to the layer's geometry size along that direction:
   ```ts
   const carouselAnim = (animation ?? []).find((a) => a.type === "carousel") as CarouselAnimation;
   const dir = normalizeDirection(carouselAnim.direction ?? { x: 1, y: 0 });
   const tileOffsetX = dir.x * geoWidth;
   const tileOffsetY = dir.y * geoHeight;
   ```

3. Render a second `<mesh>` (the "clone") alongside the original. Both share the same texture, geometry size, and z-position. In `useFrame`, position the clone at `(original.x + tileOffsetX, original.y + tileOffsetY)`:
   ```ts
   const cloneRef = useRef<Mesh>(null);

   useFrame((_, delta) => {
     // ... existing animation logic that sets meshRef position ...
     if (cloneRef.current && meshRef.current) {
       cloneRef.current.position.x = meshRef.current.position.x + tileOffsetX;
       cloneRef.current.position.y = meshRef.current.position.y + tileOffsetY;
       cloneRef.current.position.z = meshRef.current.position.z;
       cloneRef.current.scale.copy(meshRef.current.scale);
       if (animationResult.opacity !== null) {
         const mat = cloneRef.current.material;
         if ("opacity" in mat) mat.opacity = animationResult.opacity;
       }
     }
   });
   ```

4. In the JSX return, conditionally render the clone:
   ```tsx
   return (
     <>
       <mesh ref={meshRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
         <planeGeometry args={[geoWidth, geoHeight]} />
         <meshBasicMaterial map={processedTexture} transparent />
       </mesh>
       {hasCarousel && (
         <mesh ref={cloneRef} position={[basePosition.x, basePosition.y, zIndex * 0.01]}>
           <planeGeometry args={[geoWidth, geoHeight]} />
           <meshBasicMaterial map={processedTexture} transparent />
         </mesh>
       )}
     </>
   );
   ```

5. Export `normalizeDirection` from `animation.ts` (it's currently a local function) so `MapLayerMesh` can use it, or duplicate the trivial logic inline.

**Note:** The `wrapCentered` function in `computeCarousel` already wraps the displacement so the primary mesh oscillates around center. The clone just needs to be offset by exactly one tile width in the scroll direction — `wrapCentered` ensures both copies together always cover the visible frustum.

---

# Log

- 2026-02-18: Created plan for Chunk 6 - Map Markers & Interaction covering marker types, default visual, marker layer, zoom-to-marker, reset zoom, and demo integration.
- 2026-02-18: Added review fixes — 2 major (stale focusTarget on interruption, CSS transition vs useFrame conflict) and 1 minor (style tag cleanup).
- 2026-02-18: Added Fix 3 (Critical) — replace Drei `<Html>` with custom DOM overlay to fix markers not loading and markers disappearing on zoom. Drei's internal frustum culling hides markers when their projected position is outside the camera frustum, which happens during zoom animation (zoom outruns pan) and for edge markers at initial load. Renumbered old Fix 3 to Fix 4.
- 2026-02-18: Review Round 2 — Fixes 1-4 all implemented correctly. R3F "Div is not part of THREE namespace" error resolved by moving MarkerLayer outside Canvas. Added Fix 5 (Medium: marker centering offset), Fix 6 (Minor: duplicate markersById), Fix 7 (Minor: dead viewportRef in MapScene), Fix 8 (Minor: stabilize rAF loop). Fix 5 is the only one affecting visible behavior — markers appear ~7px off-position.
- 2026-02-18: Review Round 3 — Fixes 5-8 all implemented correctly. Two new bugs found: tooltip clipped by overlay `overflow: hidden`, cloud layer edge visible on zoom reset. Decision: rewrite markers as in-canvas Three.js objects (Fix 9) — eliminates DOM overlay, MarkerLayer, DefaultMarker. Drop `renderMarker` prop. Markers become `<MarkerDot>` meshes. Fix 10 (carousel tiling) kept as-is — already implemented.
- 2026-02-18: Updated Fix 9 — replaced Drei `<Html>` tooltip with a single global DOM tooltip (`MarkerTooltip.tsx`). One absolute-positioned div outside Canvas, projects active marker world position to screen via rAF + viewportRef. Zero Drei dependency for markers. No frustum culling, no overflow clipping, stable during zoom animations.
