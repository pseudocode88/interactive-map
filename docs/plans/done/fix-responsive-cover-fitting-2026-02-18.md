---
Name: Fix Responsive Cover Fitting
Type: Bug Fix
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
The base map currently always fits to the **width** of the parent container. On portrait/tall containers (tablets, mobiles, or any container where the aspect ratio is taller than the image), this leaves empty space vertically. The fix applies a "cover" strategy: compare the container's aspect ratio to the image's aspect ratio and fit to whichever dimension ensures the image fully covers the container. The overflow side is accessible via the existing pan feature.

# Plan & Instruction

## Files to Modify
1. `packages/interactive-map/src/components/InteractiveMap.tsx`
2. `packages/interactive-map/src/components/CameraController.tsx`

## Step 1: Update frustum calculation in `InteractiveMap.tsx`

**Location:** Lines 61-62

**Current code:**
```typescript
const halfWidth = baseSize.width / 2;
const halfHeight = halfWidth * (containerSize.height / containerSize.width);
```

**Replace with:**
```typescript
const containerAspect = containerSize.height / containerSize.width;
const imageAspect = baseSize.height / baseSize.width;

let halfWidth: number;
let halfHeight: number;

if (containerAspect > imageAspect) {
  // Container is taller than image ratio → fit to height, overflow width (pan left/right)
  halfHeight = baseSize.height / 2;
  halfWidth = halfHeight * (containerSize.width / containerSize.height);
} else {
  // Container is wider than image ratio → fit to width, overflow height (pan up/down)
  halfWidth = baseSize.width / 2;
  halfHeight = halfWidth * (containerSize.height / containerSize.width);
}
```

**Why:** The initial orthographic camera frustum must match the cover strategy so the canvas renders correctly on first load.

## Step 2: Update frustum calculation in `CameraController.tsx`

**Location:** Lines 81-83

**Current code:**
```typescript
const aspectRatio = size.height / size.width;
const baseFrustumHalfWidth = baseWidth / 2;
const baseFrustumHalfHeight = baseFrustumHalfWidth * aspectRatio;
```

**Replace with:**
```typescript
const containerAspect = size.height / size.width;
const imageAspect = baseHeight / baseWidth;

let baseFrustumHalfWidth: number;
let baseFrustumHalfHeight: number;

if (containerAspect > imageAspect) {
  // Container is taller than image ratio → fit to height
  baseFrustumHalfHeight = baseHeight / 2;
  baseFrustumHalfWidth = baseFrustumHalfHeight * (size.width / size.height);
} else {
  // Container is wider than image ratio → fit to width
  baseFrustumHalfWidth = baseWidth / 2;
  baseFrustumHalfHeight = baseFrustumHalfWidth * containerAspect;
}
```

**Why:** The `CameraController` recalculates the frustum on resize and uses these values for zoom/pan clamping. It must use the same cover strategy so zoom, pan boundaries, and wheel/pinch interactions remain correct across all screen sizes.

## Step 3: Update the null guard in `InteractiveMap.tsx`

**Location:** Line 35

**Current code:**
```typescript
containerSize.width === 0
```

**Replace with:**
```typescript
containerSize.width === 0 || containerSize.height === 0
```

**Why:** Since we now use both container dimensions for the calculation, guard against zero height as well to avoid division by zero.

# Acceptance Criteria
- On landscape/desktop screens (container wider than image ratio): image fits to width, overflows vertically, pan works up/down — same as current behavior.
- On portrait/mobile screens (container taller than image ratio): image fits to height, overflows horizontally, pan works left/right — no empty space.
- On resize (e.g., rotating a device), the fitting strategy switches dynamically without requiring a reload.
- Zoom (wheel + pinch) and pan continue to work correctly with proper boundary clamping in both orientations.
- No empty/background space visible at any screen size at minimum zoom level.

# Log
- 2026-02-18: Created plan for responsive cover fitting fix.
