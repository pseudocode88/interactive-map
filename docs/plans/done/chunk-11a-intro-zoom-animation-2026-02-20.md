---
Name: Intro Zoom Animation
Type: Feature
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief
Add a library-level "intro zoom" feature: the camera starts at `minZoom` and, once all assets are loaded and the loading overlay has fully faded out, smoothly animates to `initialZoom`. This creates a cinematic reveal effect when the map first appears.

# Plan & Instruction

## Step 1 — Add `animateIntroZoom` to `ZoomConfig` type

**File:** `packages/interactive-map/src/types/index.ts`

- Add an optional boolean property to `ZoomConfig`:
  ```ts
  /** When true, camera starts at minZoom and animates to initialZoom after loading completes. Default: false */
  animateIntroZoom?: boolean;
  ```

## Step 2 — Add `onFadeComplete` callback to `LoadingOverlay`

**File:** `packages/interactive-map/src/components/LoadingOverlay.tsx`

- Add `onFadeComplete?: () => void` to `LoadingOverlayProps`.
- In the existing `useEffect` that handles `state.isComplete`, call `onFadeComplete()` inside the `setTimeout` callback (right before or after `setMounted(false)`) — this is the point where the 400ms fade-out finishes and the overlay unmounts.

```ts
// Existing code in the useEffect:
const timeoutId = window.setTimeout(() => {
  setMounted(false);
  onFadeComplete?.();  // <-- add this line
}, 400);
```

## Step 3 — Track loading-complete state in `InteractiveMapContent`

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

- Add a new state variable:
  ```ts
  const [loadingFadeComplete, setLoadingFadeComplete] = useState(false);
  ```
- If `showLoadingScreen` is `false` (no loading overlay at all), initialize this to `true` instead since there's nothing to wait for:
  ```ts
  const [loadingFadeComplete, setLoadingFadeComplete] = useState(!shouldShowLoadingScreen);
  ```
- Pass `onFadeComplete` to `LoadingOverlay`:
  ```tsx
  <LoadingOverlay
    messages={loadingMessages}
    loadingStyle={loadingStyle}
    onFadeComplete={() => setLoadingFadeComplete(true)}
  />
  ```

## Step 4 — Resolve and pass `animateIntroZoom` through to `MapScene`

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

- Add `animateIntroZoom` to the resolved zoom config:
  ```ts
  const resolvedZoomConfig: Required<ZoomConfig> = {
    ...existing fields...,
    animateIntroZoom: zoomConfig?.animateIntroZoom ?? false,
  };
  ```
- Compute an `introZoomActive` boolean that is `true` when `animateIntroZoom` is enabled AND loading has NOT yet completed:
  ```ts
  const introZoomActive = resolvedZoomConfig.animateIntroZoom && !loadingFadeComplete;
  ```
- When `introZoomActive` is true, override `resolvedZoomConfig.initialZoom` to `resolvedMinZoom` so the camera starts zoomed out. Do NOT mutate the object — create a derived config:
  ```ts
  const effectiveZoomConfig = introZoomActive
    ? { ...resolvedZoomConfig, initialZoom: resolvedMinZoom }
    : resolvedZoomConfig;
  ```
- Pass `effectiveZoomConfig` to `MapScene` instead of `resolvedZoomConfig`.
- Pass a new prop `introZoomTrigger` to `MapScene`. This is a number that increments when the intro zoom should fire. Use a derived value:
  ```ts
  // Compute a trigger value: 0 while waiting, 1 once loading completes (only when animateIntroZoom is on)
  const introZoomTrigger = (resolvedZoomConfig.animateIntroZoom && loadingFadeComplete) ? 1 : 0;
  ```

## Step 5 — Pass `introZoomTrigger` through `MapScene` to `CameraController`

**File:** `packages/interactive-map/src/components/MapScene.tsx`

- Add `introZoomTrigger?: number` to `MapSceneProps`.
- Pass it through to `<CameraController introZoomTrigger={introZoomTrigger} />`.

## Step 6 — Handle intro zoom animation in `CameraController`

**File:** `packages/interactive-map/src/components/CameraController.tsx`

- Add `introZoomTrigger?: number` to `CameraControllerProps`.
- Add a ref to track the previous trigger value:
  ```ts
  const previousIntroTrigger = useRef(introZoomTrigger);
  ```
- Add a `useEffect` that watches `introZoomTrigger`. When it changes from 0 to a positive number, animate to the real `initialZoom`:
  ```ts
  useEffect(() => {
    if (introZoomTrigger === previousIntroTrigger.current) {
      return;
    }
    previousIntroTrigger.current = introZoomTrigger;

    if (introZoomTrigger && introZoomTrigger > 0) {
      targetZoom.current = zoomConfig.initialZoom;
      isProgrammaticAnim.current = true;
    }
  }, [introZoomTrigger, zoomConfig.initialZoom]);
  ```
- **Important:** The `useFrame` loop already handles smooth zoom animation using `focusEasingFactor` when `isProgrammaticAnim` is true, and it already clamps the pan position. No changes needed in `useFrame`.

## Step 7 — Update the demo to enable the feature

**File:** `apps/demo/src/app/page.tsx`

- Add `animateIntroZoom: true` to the existing `zoomConfig` prop:
  ```ts
  zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 1.6, initialZoom: 1.1, animateIntroZoom: true }}
  ```

## Step 8 — Export type changes (if needed)

- Verify that `ZoomConfig` is already exported from the package's public API. It is (via `types/index.ts` re-export). No additional export changes needed.

# Acceptance Criteria

- [ ] When `animateIntroZoom: true`, the camera starts at `minZoom` while loading is in progress
- [ ] After the loading overlay fully fades out (400ms after completion), the camera smoothly zooms to `initialZoom`
- [ ] The zoom animation uses the existing `focusEasingFactor` for smooth easing
- [ ] When `animateIntroZoom` is `false` or omitted, behavior is identical to current (no regression)
- [ ] When `showLoadingScreen` is `false`, the camera starts directly at `initialZoom` (no intro animation since there's no loading phase to wait for)
- [ ] User interactions (scroll/pinch/drag) during the intro animation interrupt it gracefully (existing `interruptFocus` mechanism)
- [ ] The `resetZoomTrigger` still works correctly after the intro animation has played

# Log

- **2026-02-20** — Created plan for intro zoom animation feature (chunk 11a)
