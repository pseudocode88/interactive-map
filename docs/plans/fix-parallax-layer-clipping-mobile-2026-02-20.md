---
Name: Fix Parallax Layer Clipping on Mobile
Type: Bug Fix
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief
Carousel layers (`cloud-slide-front`, `cloud-slide-front-2`) show a visible vertical seam on mobile. On mobile portrait, parallax `autoScale > 1` causes a UV center-crop (`texture.repeat` < 1). The carousel clone mesh tiles edge-to-edge but both meshes show the same center-cropped UV — so the right edge of mesh 1 doesn't match the left edge of mesh 2, creating a hard seam. On desktop `autoScale = 1`, UV is full (0→1), so tiling is seamless.

# Plan & Instruction

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

1. For layers with a carousel animation, skip the UV crop — keep `texture.repeat = (1, 1)` and `texture.offset = (0, 0)` regardless of `autoScale`. The carousel's wrapping clone already provides infinite horizontal coverage, so UV cropping is unnecessary.

   > The `autoScale` should still enlarge the geometry (for parallax pan offset coverage), but the texture should map fully across it using `RepeatWrapping` instead of the default `ClampToEdgeWrapping`.

2. Set `texture.wrapS = RepeatWrapping` (and `wrapT` if carousel direction has a Y component) on carousel layer textures so the enlarged geometry tiles the texture seamlessly.

3. Pass `geoWidth` / `geoHeight` instead of `textureWidth` / `textureHeight` to `computeCarousel` in `computeAnimations` call (line ~279), so the wrap cycle distance matches the actual tile offset.

## Fix 2 — Non-carousel depth layers clip on mobile

**Root cause:** `computeAutoScaleFactor` underestimates required geometry size for depth-mode parallax layers on mobile portrait. Two errors in the formula:

1. **Pan displacement uses `|pf - 1|` instead of `|pf|`** — The camera-to-layer-center distance at max pan is `pf * maxPanRange`, not `|pf - 1| * maxPanRange`. The layer is positioned at `(1 - pf) * cameraX`, so relative to camera at `cameraX` the gap is `pf * cameraX`.

2. **Depth mode divides visible area by `layerZoom` instead of `layerZoom / baseZoom`** — The render loop scales the mesh by `layerZoom / baseZoom` (MapLayerMesh line 314), but the formula uses `depthScale = layerZoom` as if that were the full render magnification. This over-divides by a factor of `baseZoom`.

> On mobile portrait with pf=1.3 at maxZoom=1.6: formula gives `autoScale = 1`, correct value is ~1.125, causing ~266px of clipping at max pan.

**File:** `packages/interactive-map/src/utils/parallax.ts` — `computeAutoScaleFactor`

Replace the coverage calculation (lines 51–61) with:

1. Compute the actual render scale: `renderScale = depthScale / extremeZoom` for depth mode, `1` otherwise.
2. Compute required rendered half-extents: `|pf| * maxPanRange + visibleHalfWidth` per axis.
3. Convert to required geometry width: `(2 * requiredHalf) / renderScale`.
4. Return `max(1, requiredGeoWidth / layerWidth, requiredGeoHeight / layerHeight)`.

# Acceptance Criteria
- No visible seam on carousel layers at any zoom level on mobile portrait
- No clipping on non-carousel depth layers (e.g. `cloud-front`) at any zoom/pan on mobile portrait
- No visual regression on desktop
- Base layer (pf=1) unaffected (early-return kept)

# Log
- 2026-02-20: Created plan targeting computeAutoScaleFactor min/max zoom (initial theory)
- 2026-02-20: Updated plan — root cause is UV crop + carousel tiling mismatch, not frustum coverage. Revised fix to skip UV crop for carousel layers and use RepeatWrapping
- 2026-02-20: Added Fix 2 — `computeAutoScaleFactor` formula uses wrong pan displacement (`|pf-1|` vs `|pf|`) and wrong depth render scale (`layerZoom` vs `layerZoom/baseZoom`), causing non-carousel depth layers to clip on mobile
