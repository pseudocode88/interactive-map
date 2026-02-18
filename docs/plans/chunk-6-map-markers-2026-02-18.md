---
Name: Chunk 6 - Map Markers & Interaction
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18
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

# Log

- 2026-02-18: Created plan for Chunk 6 - Map Markers & Interaction covering marker types, default visual, marker layer, zoom-to-marker, reset zoom, and demo integration.
