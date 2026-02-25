---
Name: Marker Style Variants + Mobile Marker Sizing
Type: Feature
Created On: 2026-02-25
Modified On: 2026-02-25
---

# Brief

Two enhancements to the map marker system:

1. **Transparent variant** — A new `style` field on `MapMarker` that renders a hollow ring instead of a solid filled circle, while keeping the same pulsating wave animation.
2. **Mobile sizing** — Two new props on `InteractiveMapProps` (`mobileMarkerScale`, `mobileBreakpoint`) that shrink markers when the map container width falls at or below a configurable breakpoint, detected via the existing `containerSize` from `useContainerSize`.

---

# Plan & Instruction

## Files to Modify

| File | Purpose |
|---|---|
| `packages/interactive-map/src/types/index.ts` | Add `style` to `MapMarker`; add mobile props to `InteractiveMapProps` |
| `packages/interactive-map/src/components/MarkerDot.tsx` | Render ring geometry for transparent variant; apply `markerScale` |
| `packages/interactive-map/src/components/MapScene.tsx` | Accept and forward `markerScale` prop to `MarkerDot` |
| `packages/interactive-map/src/components/InteractiveMap.tsx` | Compute `effectiveMarkerScale` from container width; pass to `MapScene` |

---

## Step 1 — Update `types/index.ts`

### 1a. Add `style` to `MapMarker`

Locate the `MapMarker` interface (around line 220). Add the optional `style` field **after** the `color` field:

```typescript
export interface MapMarker {
  x: number;
  y: number;
  id: string;
  label: string;
  color?: string;
  /**
   * Visual style of the marker dot.
   * - "default": solid filled circle with pulsating glow (existing behaviour)
   * - "transparent": hollow ring with pulsating wave, transparent center
   * Default: "default"
   */
  style?: "default" | "transparent";
}
```

### 1b. Add mobile marker props to `InteractiveMapProps`

Locate `InteractiveMapProps` (around line 702). Add two new optional fields after `renderConfig`:

```typescript
  /**
   * Scale factor (0–1) applied to markers when the map container width
   * is at or below `mobileBreakpoint`. For example, 0.6 shrinks markers
   * to 60% of their normal size. Default: 1 (no change).
   */
  mobileMarkerScale?: number;
  /**
   * Container width (px) below which `mobileMarkerScale` is applied.
   * Default: 768.
   */
  mobileBreakpoint?: number;
```

---

## Step 2 — Update `MarkerDot.tsx`

### 2a. Add `markerScale` to props interface

Add `markerScale` to the `MarkerDotProps` interface:

```typescript
interface MarkerDotProps {
  marker: MapMarker;
  worldX: number;
  worldY: number;
  zPosition: number;
  onHoverChange: (markerId: string | null) => void;
  onClick: () => void;
  markerScale?: number;  // new
}
```

### 2b. Destructure `markerScale` in the component

Inside `MarkerDot`, destructure the new prop with a default of `1`:

```typescript
export function MarkerDot({
  marker,
  worldX,
  worldY,
  zPosition,
  onHoverChange,
  onClick,
  markerScale = 1,  // new
}: MarkerDotProps) {
```

### 2c. Apply `markerScale` in `useFrame` scale calculations

In the `useFrame` callback, multiply `markerScale` into all three scale calculations:

**Dot scale** (currently line 62):
```typescript
const targetScale = (hoverScale * dotPulseScale * markerScale) / zoom;
```

**Halo scale** (currently line 66):
```typescript
const haloScale = (HALO_BASE_SCALE * (isHoveredRef.current ? 1.12 : 1) * markerScale) / zoom;
```

**Pulse scale** (currently line 73):
```typescript
const pulseScale = ((1.25 + pulseElapsed * 1.35) * markerScale) / zoom;
```

### 2d. Render hollow ring for the transparent variant

Locate the main dot mesh (currently lines 90–114). Replace the `<circleGeometry>` inside it with a conditional that checks `marker.style`:

- When `marker.style === "transparent"`: render `<ringGeometry>` with inner radius = 70% of `MARKER_RADIUS` (ring thickness = 30% of radius).
- Otherwise: render the existing `<circleGeometry>`.

The halo and pulse ring meshes remain **unchanged** — they use additive blending at low opacity and behave identically for both variants.

The updated main dot mesh:

```tsx
<mesh
  ref={dotRef}
  onPointerDown={(event) => { event.stopPropagation(); }}
  onClick={(event) => { event.stopPropagation(); onClick(); }}
  onPointerOver={(event) => {
    event.stopPropagation();
    isHoveredRef.current = true;
    onHoverChange(marker.id);
    document.body.style.cursor = "pointer";
  }}
  onPointerOut={(event) => {
    event.stopPropagation();
    isHoveredRef.current = false;
    onHoverChange(null);
    document.body.style.cursor = "auto";
  }}
>
  {marker.style === "transparent" ? (
    <ringGeometry args={[MARKER_RADIUS * 0.7, MARKER_RADIUS, 32]} />
  ) : (
    <circleGeometry args={[MARKER_RADIUS, 32]} />
  )}
  <meshBasicMaterial color={color} />
</mesh>
```

> **Note:** `RingGeometry(innerRadius, outerRadius, thetaSegments)` — the geometry itself creates the hole; no material transparency is needed on the dot material.

---

## Step 3 — Update `MapScene.tsx`

### 3a. Add `markerScale` to `MapSceneProps`

In the `MapSceneProps` interface (around line 33), add:

```typescript
markerScale?: number;  // new — forwarded to each MarkerDot
```

### 3b. Destructure `markerScale` in the component

Add `markerScale = 1` to the `MapScene` function parameter destructuring.

### 3c. Forward `markerScale` to `<MarkerDot>`

In the marker render loop (around line 540), pass the prop:

```tsx
<MarkerDot
  key={marker.id}
  marker={marker}
  worldX={worldX}
  worldY={worldY}
  zPosition={markerZPosition}
  onHoverChange={stableHoverChange}
  onClick={() => onMarkerClick?.(marker.id)}
  markerScale={markerScale}  // new
/>
```

---

## Step 4 — Update `InteractiveMap.tsx`

### 4a. Destructure the new props

In the `InteractiveMapContent` function parameter list (around line 32), add:

```typescript
mobileMarkerScale,
mobileBreakpoint,
```

### 4b. Compute `effectiveMarkerScale`

After the existing `containerSize` usage (around line 125), compute the effective scale. `containerSize` is already available at this point via `useContainerSize(containerRef)`:

```typescript
const effectiveMarkerScale =
  mobileMarkerScale !== undefined &&
  containerSize !== null &&
  containerSize.width <= (mobileBreakpoint ?? 768)
    ? mobileMarkerScale
    : 1;
```

### 4c. Pass `markerScale` to `<MapScene>`

Find the `<MapScene>` JSX in the render (search for `<MapScene`). Add the new prop:

```tsx
markerScale={effectiveMarkerScale}
```

---

# Acceptance Criteria

- [ ] `MapMarker` type has an optional `style?: "default" | "transparent"` field.
- [ ] Markers with `style: "default"` (or no `style`) render exactly as before — no visual regression.
- [ ] Markers with `style: "transparent"` render a hollow ring (30% thickness, transparent center) with the marker's `color` applied to the ring stroke, retaining the same pulsating wave and hover animations.
- [ ] `InteractiveMapProps` has `mobileMarkerScale?: number` and `mobileBreakpoint?: number`.
- [ ] When `mobileMarkerScale` is not provided, marker size is unchanged at all container widths.
- [ ] When `mobileMarkerScale` is provided and the container width ≤ `mobileBreakpoint` (default 768px), all markers scale uniformly by the given factor.
- [ ] Mobile scaling responds to live container resize (the existing `useContainerSize` ResizeObserver handles this automatically).
- [ ] Both features are backward-compatible — existing usage without the new props is unaffected.
- [ ] TypeScript types are exported correctly (no new type exports required; `style` is part of existing `MapMarker`).

---

# Log

- **2026-02-25** — Plan created. Covers two features: transparent hollow ring marker variant (`style` field on `MapMarker`) and responsive mobile marker scaling (`mobileMarkerScale` + `mobileBreakpoint` props on `InteractiveMapProps`). Uses existing `useContainerSize` hook and `containerSize` in `InteractiveMap.tsx` — no new hooks needed.
