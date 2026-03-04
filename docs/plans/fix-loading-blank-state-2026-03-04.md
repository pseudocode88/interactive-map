---
Name: Fix Loading Blank State
Type: Bug Fix
Created On: 2026-03-04
Modified On: 2026-03-04
---

# Brief

After the loading overlay disappears, there is a blank canvas state before map images appear. On slow internet (or cached assets), the loading bar hits 100% and fades out prematurely — before the map layers have actually rendered to screen.

# Plan & Instruction

## Root Cause Summary

Two bugs compound to cause the blank state:

**Bug 1 — Premature `isComplete = true`**
`useBaseImageSize` registers and completes the `BASE_IMAGE` stage in the LoadingManager. When the base image loads, React exits the early return and mounts `Canvas`, `MapScene`, and `LoadingOverlay` in the same commit. At that moment, `BASE_IMAGE` is the **only registered stage** — so `computeSnapshot` returns `isComplete: true`. `LoadingOverlay` sees this on its first render, immediately sets `isFadingOut = true`, and the overlay starts fading. Shortly after, `MapScene`'s effects register the remaining stages (`LAYER_TEXTURES`, etc.), dropping `isComplete` back to false — but `isFadingOut` is never reset, leaving the overlay stuck at `opacity: 0` while the canvas is still blank (Suspense fallback = null).

**Bug 2 — `FIRST_FRAME` fires pre-render**
`completeStage(FIRST_FRAME)` is called inside `useFrame`, which fires **before** `renderer.render()`. Textures are on the CPU but not yet GPU-uploaded. On large maps, GPU upload can take 1–2 additional frames after FIRST_FRAME is marked complete, causing a brief blank frame when the overlay fades.

## Steps

### Step 1 — Remove `BASE_IMAGE` from LoadingManager (`useBaseImageSize.ts`)

The base image loading happens entirely before the loading overlay is ever visible (the component is in early return during this period). There is no user benefit to tracking it in the LoadingManager.

- Remove the `registerStage(LoadingStage.BASE_IMAGE, ...)` call
- Remove the `completeStage(LoadingStage.BASE_IMAGE)` calls (both success and error paths)
- Remove the `useLoadingManager()` hook usage from this file
- Keep the `LoadingStage.BASE_IMAGE` enum value in `LoadingManagerContext.tsx` to avoid a breaking change, but it becomes unused internally

**Effect:** When `LoadingOverlay` first mounts, the stages map is empty → `EMPTY_SNAPSHOT` → `isComplete: false` → no premature fade.

### Step 2 — Guard `isComplete` with `FIRST_FRAME` registration (`LoadingManagerContext.tsx`)

In `computeSnapshot`, add a condition: `isComplete` can only be `true` when the `FIRST_FRAME` stage has been registered. Since `FIRST_FRAME` is exclusively registered by `MapScene`, this prevents false completion in any edge case where stage registration is still in-flight.

- In `computeSnapshot`, after computing `overallProgress`, check `stages.has(LoadingStage.FIRST_FRAME)` before setting `isComplete: true`
- If `FIRST_FRAME` is not yet registered, force `isComplete: false` regardless of `overallProgress`

### Step 3 — Reset `isFadingOut` when loading resumes (`LoadingOverlay.tsx`)

Safety net: if `isComplete` ever drops back to `false` while the overlay is fading, the overlay should revert to fully visible.

- In the `useEffect` that watches `state.isComplete`, add `setIsFadingOut(false)` in the `!state.isComplete` branch before returning
- This ensures the overlay snaps back to `opacity: 1` if loading resumes after a false-complete state

### Step 4 — Delay `FIRST_FRAME` to the 2nd frame (`MapScene.tsx`)

Change the `useFrame` callback so it completes `FIRST_FRAME` on the **second** invocation rather than the first. By the second frame, `renderer.render()` has already been called once — GPU texture upload has completed and the first image is on screen.

- Add a frame counter ref alongside `firstFrameReportedRef`
- Increment on each `useFrame` call; only call `completeStage(LoadingStage.FIRST_FRAME)` when the counter reaches 2

# Acceptance Criteria

- On slow internet (or throttled DevTools), the loading overlay remains visible until all map layers are fully rendered to the canvas
- No blank canvas state is visible between the overlay disappearing and the images appearing
- The loading progress bar does not jump backwards or spike to 100% prematurely
- The overlay fades out smoothly and images are already visible through the fade
- Behavior is unchanged when `showLoadingScreen` is `false`

# Log

- 2026-03-04: Plan created. Two root causes identified: premature `isComplete: true` due to `BASE_IMAGE` being the sole registered stage at overlay mount time, and `FIRST_FRAME` firing pre-render. Four targeted fixes planned across `useBaseImageSize.ts`, `LoadingManagerContext.tsx`, `LoadingOverlay.tsx`, and `MapScene.tsx`.
