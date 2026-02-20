---
Name: Optimize Demo Mobile Load Time
Type: Performance Optimization
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief
The demo currently loads slowly on mobile because startup work is too heavy in three areas: network payload (large 4K PNG textures), GPU fill/render cost (full DPR + antialias), and CPU initialization/runtime cost (high particle counts + mask-driven sampling). This plan reduces startup time and improves first interactive frame while preserving visual quality on desktop.

# Plan & Instruction

## 1. Reduce startup asset payload (highest impact)

**Files:** `apps/demo/public/*`, `apps/demo/src/app/page.tsx`

1. Convert large PNG layers (`base-map`, `overlay-cloud-back`, `overlay`, carousel clouds) to WebP with alpha.
2. Generate mobile variants (for example, 1280w and 1920w) for each heavy layer.
3. Update demo layer config to select mobile sources on small viewports.
4. Keep original PNG files only as fallback if needed for comparison/testing.

## 2. Add mobile renderer quality cap

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Cap canvas DPR to reduce pixel workload on high-density screens.
2. Disable antialias on low-end/mobile profile.
3. Keep desktop defaults unchanged.

## 3. Create a mobile effect budget

**Files:** `apps/demo/src/app/page.tsx`, `packages/interactive-map/src/components/ParticleEffect.tsx` (if needed for guardrails)

1. Reduce particle counts for mobile profile (especially mask-based systems).
2. Disable at least one carousel cloud layer on mobile.
3. Keep one lightweight atmospheric effect (sprite or a small particle set) for visual continuity.
4. Defer non-critical effects until after first frame or first user interaction.

## 4. Improve loading behavior and sequencing

**Files:** `packages/interactive-map/src/context/LoadingManagerContext.tsx`, `packages/interactive-map/src/components/MapScene.tsx`

1. Stop blocking initial reveal on non-critical stages (particle init can continue after map is visible).
2. Prioritize base layer + essential map layers for "first usable paint".
3. Ensure loading progress reflects user-visible readiness, not total background work.

## 5. Optional structural optimization

**Files:** `packages/interactive-map/src/hooks/useBaseImageSize.ts`, related consumers

1. Remove or minimize duplicate image-load path used only for base dimensions.
2. Reuse already-loaded texture metadata when possible.

# Acceptance Criteria

1. Mobile first visual frame appears significantly faster than current baseline.
2. Map is interactive before all decorative effects finish loading.
3. No desktop visual regressions.
4. Mobile frame pacing is stable during pan/zoom.

# Suggested Benchmarks

1. Record baseline and after metrics on a real mid-range phone:
   - Time to first map frame
   - Time to interactive pan
   - Total transferred bytes for initial load
2. Target a meaningful reduction in initial asset transfer and first-frame latency.

# Log
- 2026-02-20: Initial performance plan created from demo audit (asset weight, renderer settings, particle/mask runtime cost, loading stage sequencing).
