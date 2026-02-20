---
Name: Fix Parallax Layer Clipping on Mobile
Type: Bug Fix
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief
Non-base layers with parallax (depth mode) clip horizontally on mobile portrait screens at all zoom levels. The `computeAutoScaleFactor` in `packages/interactive-map/src/utils/parallax.ts` only considers the zoomed-in extreme when sizing layer geometry, but on mobile the zoomed-out case causes layers to shrink (via depth scaling) while the visible frustum expands — resulting in horizontal gaps.

# Plan & Instruction
1. Update `computeAutoScaleFactor` in `packages/interactive-map/src/utils/parallax.ts` to compute required layer coverage for **both** min zoom (zoomed out) and max zoom (zoomed in), then use the larger of the two. Currently `extremeZoom = Math.max(maxZoom, minZoom, 1)` only handles the zoomed-in case. The zoomed-out case (`zoom < 1`) needs separate calculation where the visible area grows and depth scale shrinks the layer.
2. Verify the fix in the demo app at mobile portrait resolutions (e.g., 375x667, 390x844) across min zoom, default zoom, and max zoom.

# Acceptance Criteria
- No horizontal clipping on non-base parallax layers at any zoom level on mobile portrait viewports
- No visual regression on desktop viewports
- Existing parallax depth/drift behavior unchanged

# Log
- 2026-02-20: Created plan based on root cause analysis of frustum vs depth scaling mismatch on narrow viewports
