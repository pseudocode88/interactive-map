---
Name: Loading Progress Bar
Type: Feature
Created On: 2026-02-20
Modified On: 2026-02-20
---

# Brief

Add a centralized loading progress bar with milestone-based messages to `@interactive-map/core`. The loader displays a minimal, centered overlay on top of the canvas while assets load. Each loading stage (base image, textures, masks, particles, first frame) reports progress to a central manager. Consumers can customize messages and styling via props.

# Plan & Instruction

## Step 1: Create LoadingManager Context

**File:** `packages/interactive-map/src/context/LoadingManagerContext.tsx`

Create a React context + provider that tracks loading stages centrally.

- Define a `LoadingStage` enum:
  ```
  BASE_IMAGE = "base-image"
  LAYER_TEXTURES = "layer-textures"
  MASK_TEXTURES = "mask-textures"
  PARTICLE_INIT = "particle-init"
  FIRST_FRAME = "first-frame"
  ```
- Define `LoadingManagerState`:
  ```
  stages: Map<string, { label: string; progress: number }> // 0-1 per stage
  overallProgress: number // 0-100, computed from stages
  isComplete: boolean
  currentStage: string // active stage label for display
  ```
- Provider holds the stage map in a `useRef` (to avoid re-renders on every progress tick) and exposes:
  - `registerStage(id: string, label: string)` — register a stage with weight
  - `updateStageProgress(id: string, progress: number)` — update 0-1 progress for a stage
  - `completeStage(id: string)` — mark stage as 1.0
  - `subscribe(callback: (state: LoadingManagerState) => void)` — subscribe to progress updates (pub-sub pattern to avoid excessive re-renders)
- Overall progress = weighted average of all registered stages. Weights:
  - `BASE_IMAGE`: 10%
  - `LAYER_TEXTURES`: 40%
  - `MASK_TEXTURES`: 20%
  - `PARTICLE_INIT`: 20%
  - `FIRST_FRAME`: 10%
- If a stage has no work (e.g., no masks configured), it should auto-complete with progress 1.0 so overall progress still reaches 100%.
- `isComplete` becomes `true` when `overallProgress >= 100`.

## Step 2: Create Loading Overlay Component

**File:** `packages/interactive-map/src/components/LoadingOverlay.tsx`

A minimal, centered overlay rendered on top of the canvas container.

- Subscribe to `LoadingManagerContext` using the `subscribe` method. Use `useSyncExternalStore` or a local `useState` with the subscribe callback to get reactive updates.
- Display:
  - A progress bar (horizontal, centered)
  - A message label below the bar showing the current milestone message
- **Message rotation logic:**
  - Accept `messages: string[]` prop (consumer-provided or default)
  - Default messages:
    ```
    "Preparing the canvas..."
    "Loading map layers..."
    "Applying masks..."
    "Initializing particles..."
    "Rendering first frame..."
    ```
  - Map messages to progress thresholds: message[0] at 0%, message[1] at 20%, etc. (evenly distributed across the array length)
  - Show the message whose threshold is <= current `overallProgress`
- **Styling:**
  - Accept an optional `loadingStyle` prop:
    ```ts
    interface LoadingStyleConfig {
      barColor?: string        // default: "#ffffff"
      backgroundColor?: string // default: "rgba(0, 0, 0, 0.85)"
      textColor?: string       // default: "#cccccc"
      barHeight?: number       // default: 4 (px)
      font?: string            // default: "inherit"
    }
    ```
  - Use inline styles (no CSS dependencies)
  - Layout: full container overlay, flexbox centered column
  - Progress bar: fixed width (e.g., 240px), rounded corners, smooth width transition (`transition: width 0.3s ease`)
- **Fade-out:** When `isComplete` becomes true:
  - Add a brief fade-out animation (opacity 1 -> 0 over ~400ms)
  - After fade completes, unmount the overlay (use a local state + `onTransitionEnd` or `setTimeout`)
- The overlay should have `pointer-events: none` during fade-out so the map is immediately interactive.

## Step 3: Define Props on InteractiveMap

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

Add new optional props to `InteractiveMapProps`:

```ts
loadingMessages?: string[]
loadingStyle?: LoadingStyleConfig
showLoadingScreen?: boolean // default: true
```

- Wrap the existing render tree with `<LoadingManagerProvider>`.
- Render `<LoadingOverlay>` as a sibling to the `<Canvas>`, positioned absolutely over it.
- Only render `<LoadingOverlay>` when `showLoadingScreen` is not `false`.

**File:** `packages/interactive-map/src/types/index.ts`

- Export `LoadingStyleConfig` type.
- Add the new props to `InteractiveMapProps`.

## Step 4: Integrate Hooks with Loading Manager

Modify existing hooks to report progress to the loading manager. Each hook calls the context methods.

### 4a: Base Image Stage

**File:** `packages/interactive-map/src/hooks/useBaseImageSize.ts`

- After hook mounts, call `registerStage("base-image", "Loading base image")`
- On `image.onload`, call `completeStage("base-image")`
- On `image.onerror`, still call `completeStage("base-image")` so loading isn't stuck

### 4b: Layer Textures Stage

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

- This component uses `useLoader(TextureLoader, src)` from R3F, which suspends until loaded.
- After the component mounts (texture is loaded since Suspense resolved), call `completeStage` for this layer.
- To track per-layer progress, register each layer as a sub-stage:
  - In `MapScene.tsx`, before rendering layer meshes, register the `LAYER_TEXTURES` stage.
  - Use a ref-based counter: track how many layers have reported loaded vs total layers.
  - Each `MapLayerMesh` calls a callback `onTextureLoaded` (passed as prop from MapScene) after mount via `useEffect`.
  - `MapScene` updates the loading manager: `updateStageProgress("layer-textures", loadedCount / totalCount)`
  - When all layers loaded, `completeStage("layer-textures")`
- If there are 0 layers, auto-complete the stage.

### 4c: Mask Textures Stage

**File:** `packages/interactive-map/src/hooks/useMaskTexture.ts` and `packages/interactive-map/src/hooks/useMaskSampler.ts`

- Similar pattern to layer textures.
- In `MapScene.tsx`, count total mask operations (GPU textures + CPU samplers).
- Register `MASK_TEXTURES` stage with that count.
- Each mask hook calls a completion callback.
- Update progress as masks load: `updateStageProgress("mask-textures", loadedCount / totalCount)`
- If no masks configured, auto-complete the stage immediately after registration.

### 4d: Particle Init Stage

**File:** `packages/interactive-map/src/components/ParticleEffect.tsx`

- Similar tracking pattern.
- Register `PARTICLE_INIT` stage in `MapScene.tsx` based on particle effect count.
- Each `ParticleEffect` reports ready after particle array initialization completes (after `initializeParticles` or `initializeMaskedParticles` runs).
- Pass `onParticleReady` callback from `MapScene`.
- If no particle effects, auto-complete.

### 4e: First Frame Stage

**File:** `packages/interactive-map/src/components/MapScene.tsx`

- Register `FIRST_FRAME` stage.
- Use a `useFrame` hook that runs once:
  ```
  const firstFrameReported = useRef(false)
  useFrame(() => {
    if (!firstFrameReported.current) {
      firstFrameReported.current = true
      completeStage("first-frame")
    }
  })
  ```
- This ensures the WebGL context has actually rendered at least one frame.

## Step 5: Access Loading Manager Inside Canvas

The `<Canvas>` from R3F creates a separate React reconciler. The loading manager context from the outer React tree is **not accessible** inside `<Canvas>` children.

**Solution:** Use a bridge pattern.

**File:** `packages/interactive-map/src/components/LoadingManagerBridge.tsx`

- In `InteractiveMap.tsx`, consume the loading manager context outside `<Canvas>` and pass it as a prop to a bridge component inside `<Canvas>`.
- The bridge component re-provides the context inside the R3F tree:
  ```
  function LoadingManagerBridge({ manager, children }) {
    return (
      <LoadingManagerContext.Provider value={manager}>
        {children}
      </LoadingManagerContext.Provider>
    )
  }
  ```
- Wrap `<MapScene>` with `<LoadingManagerBridge>` inside `<Canvas>`.

## Step 6: Create useLoadingManager Hook

**File:** `packages/interactive-map/src/hooks/useLoadingManager.ts`

- A convenience hook that consumes `LoadingManagerContext`.
- Returns `{ registerStage, updateStageProgress, completeStage }`.
- If context is not available (e.g., `showLoadingScreen` is false), return no-op functions so hooks don't break.

## Step 7: Export Public API

**File:** `packages/interactive-map/src/index.ts`

- Export `LoadingStyleConfig` type.
- The new props on `InteractiveMap` are already part of `InteractiveMapProps` (exported).
- Do NOT export internal loading manager context or hooks — keep them internal.

## Step 8: Update Demo App

**File:** `apps/demo/src/app/page.tsx`

- Add example usage with custom messages and style:
  ```tsx
  <InteractiveMap
    loadingMessages={[
      "Unrolling the map...",
      "Painting the terrain...",
      "Summoning creatures...",
      "Lighting the torches...",
      "Adventure awaits..."
    ]}
    loadingStyle={{
      barColor: "#c8a860",
      backgroundColor: "rgba(10, 8, 5, 0.9)",
      textColor: "#d4c5a0"
    }}
    // ...existing props
  />
  ```

## File Summary

| Action | File |
|--------|------|
| Create | `packages/interactive-map/src/context/LoadingManagerContext.tsx` |
| Create | `packages/interactive-map/src/components/LoadingOverlay.tsx` |
| Create | `packages/interactive-map/src/components/LoadingManagerBridge.tsx` |
| Create | `packages/interactive-map/src/hooks/useLoadingManager.ts` |
| Modify | `packages/interactive-map/src/types/index.ts` |
| Modify | `packages/interactive-map/src/components/InteractiveMap.tsx` |
| Modify | `packages/interactive-map/src/components/MapScene.tsx` |
| Modify | `packages/interactive-map/src/components/MapLayerMesh.tsx` |
| Modify | `packages/interactive-map/src/components/ParticleEffect.tsx` |
| Modify | `packages/interactive-map/src/hooks/useBaseImageSize.ts` |
| Modify | `packages/interactive-map/src/hooks/useMaskTexture.ts` |
| Modify | `packages/interactive-map/src/hooks/useMaskSampler.ts` |
| Modify | `packages/interactive-map/src/index.ts` |
| Modify | `apps/demo/src/app/page.tsx` |

# Acceptance Criteria

- Loading overlay appears on mount with progress bar at 0% and first message displayed
- Progress bar advances as each loading stage completes (base image, layers, masks, particles, first frame)
- Messages rotate based on progress thresholds mapped to the messages array
- Progress reaches 100% and overlay fades out after first frame renders
- Map is interactive immediately during fade-out (pointer-events: none)
- Consumer can pass custom `loadingMessages` array to override defaults
- Consumer can pass `loadingStyle` to customize bar color, background, text color, bar height, and font
- Default styling works without any props (white bar, dark background)
- `showLoadingScreen={false}` disables the loading overlay entirely without breaking anything
- Loading manager no-ops gracefully when loading screen is disabled
- Stages with no work (e.g., no masks) auto-complete and don't block progress
- Error cases (failed image loads) still complete their stage so loading doesn't hang
- No extra re-renders on the canvas — loading manager uses pub-sub, not React state
- All new types are exported from the package

# Log

- 2026-02-20: Initial plan created
