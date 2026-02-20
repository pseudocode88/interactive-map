---
Name: Fix Carousel Seamless Tiling
Type: Bug Fix
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief
Currently, carousel layers exhibit a hard jump/pop after completing the first scroll cycle. The image fully exits the viewport before re-entering from the opposite side. This fix makes the carousel seamlessly tile — as the trailing edge exits one side, the leading edge simultaneously enters from the other.

# Plan & Instruction

Three coordinated changes are needed across two files. All three must be applied together.

## Step 1: Negate the clone offset direction
**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx` (~line 253)

Change the `tileOffset` calculation to negate the carousel direction. This places the clone mesh on the **opposite** side of movement, so it fills the gap the main mesh leaves behind as it scrolls.

## Step 2: Replace `wrapCentered` with standard positive modulo
**File:** `packages/interactive-map/src/utils/animation.ts` (~lines 39-47, 93)

Replace the `wrapCentered` call in `computeCarousel` with a standard positive modulo: `((displacement % wrapCycleLength) + wrapCycleLength) % wrapCycleLength`. This ensures the offset increases smoothly from `0` to `wrapDist` and then snaps back to `0` — at that snap point, the clone is exactly where the main was, making the transition visually seamless. `wrapCentered` oscillates around zero which causes a hard discontinuity.

## Step 3: Change wrap distance from `baseWidth + layerWidth` to `layerWidth`
**File:** `packages/interactive-map/src/utils/animation.ts` (~lines 86-87)

Update `wrapDistX` to `layerWidth` and `wrapDistY` to `layerHeight`. Since the clone is now adjacent on the opposite side, the pair only needs to travel one image width before the cycle repeats. The old distance (`base + layer`) was designed for the previous offset direction and is now too large.

# Acceptance Criteria
- Carousel layers scroll continuously with no visible pop or jump at any point in the cycle
- The trailing edge of the image exiting one side and the leading edge entering the opposite side are visible simultaneously
- Existing carousel configurations (e.g., olympus cloud layers) work without config changes
- Both horizontal and diagonal carousel directions work seamlessly

# Log
- 2026-02-20: Plan created based on brainstorming session analyzing the root cause across `wrapCentered`, wrap distance, and clone offset direction
