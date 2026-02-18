---
Name: Base Layer Viewport Lock
Type: Enhancement
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief

Currently, the viewport/camera frustum is determined by the layer with the **lowest `zIndex`**. In the demo, `cloud-back` (zIndex: -1) is used as the reference, which means the camera fits the cloud texture — not the island base map. This causes the viewport to appear larger than intended.

This plan adds a `baseLayerId` prop to `InteractiveMap` so consumers can explicitly specify which layer the camera, pan bounds, and zoom bounds should lock to.

# Plan & Instruction

## Step 1: Update `InteractiveMapProps` type

**File:** `packages/interactive-map/src/types/index.ts`

Add `baseLayerId` to `InteractiveMapProps`:

```typescript
export interface InteractiveMapProps {
  layers: MapLayer[];
  /** ID of the layer to use as the viewport reference. If not provided, defaults to the layer with the lowest zIndex. */
  baseLayerId?: string;
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
  zoomConfig?: ZoomConfig;
}
```

## Step 2: Update base layer resolution in `InteractiveMap` component

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

Update the component to accept and use the new `baseLayerId` prop.

1. Destructure `baseLayerId` from props (line 12-19):
   ```typescript
   export function InteractiveMap({
     layers,
     baseLayerId,
     width = "100%",
     height = "100%",
     className,
     panConfig,
     zoomConfig,
   }: InteractiveMapProps) {
   ```

2. Update the `baseLayer` useMemo (lines 21-27) to prefer `baseLayerId` lookup, falling back to lowest-zIndex:
   ```typescript
   const baseLayer = useMemo(() => {
     if (layers.length === 0) {
       return null;
     }

     if (baseLayerId) {
       const found = layers.find((l) => l.id === baseLayerId);
       if (found) return found;
       console.warn(
         `[InteractiveMap] baseLayerId "${baseLayerId}" not found in layers. Falling back to lowest zIndex.`
       );
     }

     return [...layers].sort((a, b) => a.zIndex - b.zIndex)[0];
   }, [layers, baseLayerId]);
   ```

No other changes needed in this file — the rest of the logic already uses `baseSize` derived from `baseLayer.src`.

## Step 3: Update the demo to use `baseLayerId`

**File:** `apps/demo/src/app/page.tsx`

Add the `baseLayerId` prop to the `InteractiveMap` usage:

```tsx
<InteractiveMap
  layers={layers}
  baseLayerId="base"
  panConfig={{ enabled: true, easingFactor: 0.15 }}
  zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 2, initialZoom: 1.2 }}
/>
```

## Step 4: Build and verify

1. Run the build to make sure there are no TypeScript errors:
   ```bash
   cd /Users/jaison.justus/Personal/Code/InteractiveMap
   pnpm build
   ```
2. Run the demo app and visually verify:
   - The viewport should now fit the base island image, not the cloud overlay
   - Cloud layers should extend beyond the viewport edges (they'll still render but be cropped by the camera)
   - Pan bounds should be clamped to the base island dimensions
   - Zoom should work relative to the base island bounds

# Acceptance Criteria

- [ ] `InteractiveMapProps` has an optional `baseLayerId?: string` property
- [ ] When `baseLayerId` is provided, the camera frustum and pan/zoom bounds use that layer's image dimensions
- [ ] When `baseLayerId` is not provided, behavior is unchanged (falls back to lowest zIndex)
- [ ] When `baseLayerId` doesn't match any layer id, a console warning is logged and it falls back to lowest zIndex
- [ ] Demo app uses `baseLayerId="base"` and the viewport locks to the island, not the clouds
- [ ] Build passes with no TypeScript errors

# Log

- **2026-02-18 (Created):** Initial plan for adding `baseLayerId` prop to lock viewport to a specific layer instead of always using the lowest-zIndex layer.
