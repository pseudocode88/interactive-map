---
Name: Layer Parallax
Type: Feature
Created On: 2026-02-18
Modified On: 2026-02-18 (review fixes)
---

# Brief
Add a parallax effect to the interactive map so that when the user pans and zooms, each layer moves/scales at a different rate based on its depth (zIndex). This creates an illusion of depth — closer layers (higher zIndex) move faster, farther layers (lower zIndex) move slower. The base layer always moves at the normal rate (factor = 1.0). The feature is opt-in via a `parallaxConfig` prop.

Two zoom parallax modes are supported:
- **depth** — closer layers scale up faster on zoom, creating a "popping out" effect
- **drift** — zoom parallax only affects positional offset (layers spread apart/together)

Parallax layers are auto-scaled slightly larger to guarantee no empty edges are revealed.

# Plan & Instruction

## Step 1: Add Types

**File:** `packages/interactive-map/src/types/index.ts`

1. Add `ParallaxConfig` interface:
   ```ts
   export interface ParallaxConfig {
     /** Global multiplier applied to auto-calculated parallax factors. Default: 0.3 */
     intensity?: number;
     /**
      * 'depth' — closer layers scale faster on zoom (pop-out effect).
      * 'drift' — zoom parallax only affects positional offset (layers spread apart).
      * Default: 'depth'
      */
     mode?: "depth" | "drift";
   }
   ```

2. Add optional `parallaxFactor` to `MapLayer` interface:
   ```ts
   export interface MapLayer {
     // ... existing fields ...
     /**
      * Override the auto-calculated parallax factor for this layer.
      * 1.0 = moves with camera (base layer speed).
      * < 1.0 = moves slower (feels farther).
      * > 1.0 = moves faster (feels closer).
      * Only used when parallaxConfig is provided on the map.
      */
     parallaxFactor?: number;
   }
   ```

3. Add `parallaxConfig` to `InteractiveMapProps`:
   ```ts
   export interface InteractiveMapProps {
     // ... existing fields ...
     /** Enable parallax effect. If not provided, parallax is disabled. */
     parallaxConfig?: ParallaxConfig;
   }
   ```

## Step 2: Create Parallax Utility

**File (new):** `packages/interactive-map/src/utils/parallax.ts`

Create a utility module with the following functions:

1. `computeParallaxFactor(layer, baseLayerZIndex, intensity)`:
   - If `layer.parallaxFactor` is defined, return it directly (user override).
   - Otherwise, calculate: `1 + (layer.zIndex - baseLayerZIndex) * intensity`
   - The base layer always returns `1.0`.

2. `computeParallaxScale(parallaxFactor, mode)`:
   - For `"depth"` mode: return `parallaxFactor` (used to multiply the zoom level per layer).
   - For `"drift"` mode: return `1.0` (no scale difference, only positional offset).

3. `computeAutoScaleFactor(parallaxFactor, maxZoom, minZoom, mode, baseWidth, baseHeight, baseFrustumHalfWidth, baseFrustumHalfHeight, layerWidth, layerHeight)`:
   - **Important:** Accepts `layerWidth` and `layerHeight` as parameters — the layer's own texture dimensions, NOT the base image size. The final ratio must divide by the layer's own size since that's what gets scaled.
   - Calculate the maximum possible pan offset for this layer at the most extreme zoom.
   - Return a scale multiplier (>= 1.0) that the layer's geometry should be enlarged by to guarantee full viewport coverage at all pan/zoom positions.
   - The logic:
     - At max zoom, the visible area is `baseFrustumHalf / maxZoom`.
     - The max pan offset for this layer relative to camera = `maxPanRange * |parallaxFactor - 1|`.
     - For depth mode, also account for the layer's effective zoom being different.
     - The required extra coverage = `2 * maxPanOffset + visibleArea` compared to the **layer's own image size**.
     - Return `max(1.0, requiredWidth / layerWidth, requiredHeight / layerHeight)`.
   - **Note:** Since layer texture dimensions are only available after loading (inside `MapLayerMesh` via `useLoader`), this function should be called inside `MapLayerMesh` rather than `MapScene`.

## Step 3: Refactor Camera to Expose Viewport State

**File:** `packages/interactive-map/src/components/CameraController.tsx`

The parallax layers need to know the camera's current position and zoom to compute their individual offsets. Currently these values live inside `CameraController` as refs.

1. Add a new prop `onViewportChange` callback to `CameraControllerProps`:
   ```ts
   interface CameraControllerProps {
     // ... existing props ...
     onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
   }
   ```

2. In the `useFrame` loop, after updating camera position and zoom, call `onViewportChange` with the current interpolated values:
   ```ts
   onViewportChange?.({
     x: camera.position.x,
     y: camera.position.y,
     zoom: currentZoom.current,
   });
   ```

3. No other changes to CameraController. Pan/zoom logic, boundary clamping, and easing remain unchanged.

## Step 4: Update MapLayerMesh for Parallax

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

1. Add new optional props:
   ```ts
   interface MapLayerMeshProps {
     // ... existing props ...
     parallaxFactor?: number;       // computed factor for this layer (1.0 = no parallax)
     parallaxMode?: "depth" | "drift";
     viewportRef?: React.RefObject<{ x: number; y: number; zoom: number }>;
     // Parallax config values needed for autoScale computation:
     maxZoom?: number;
     minZoom?: number;
     baseFrustumHalfWidth?: number;
     baseFrustumHalfHeight?: number;
   }
   ```

2. **Auto-scale computation inside MapLayerMesh:** After the texture loads (via `useLoader`), compute `autoScale` using `computeAutoScaleFactor(...)` with the layer's own `textureWidth` and `textureHeight`. This ensures correct coverage regardless of whether the layer image matches the base image size.

3. **Geometry scaling:** If `autoScale` is > 1.0, multiply the plane geometry dimensions by `autoScale`:
   ```ts
   const geoWidth = textureWidth * (autoScale ?? 1);
   const geoHeight = textureHeight * (autoScale ?? 1);
   ```
   Also scale the texture UV mapping to compensate (so the image covers the larger geometry without stretching — it effectively crops from center). Use `texture.repeat` and `texture.offset`:
   ```ts
   const uvScale = 1 / (autoScale ?? 1);
   texture.repeat.set(uvScale, uvScale);
   texture.offset.set((1 - uvScale) / 2, (1 - uvScale) / 2);
   ```

3. **Per-frame parallax offset:** In `useLayerAnimation` hook (or a new `useFrame` in the mesh), if `parallaxFactor !== 1.0` and `viewportRef` is provided:

   **Pan parallax:**
   ```ts
   // Camera position represents where the base layer "looks at"
   // This layer should offset from that position
   const panOffsetX = viewportRef.current.x * (1 - parallaxFactor);
   const panOffsetY = viewportRef.current.y * (1 - parallaxFactor);
   mesh.position.x = basePosition.x + animOffset.x + panOffsetX;
   mesh.position.y = basePosition.y + animOffset.y + panOffsetY;
   ```
   - When `parallaxFactor < 1` (far layer): `1 - factor` is positive, so layer shifts in the same direction as camera, making it appear to move slower.
   - When `parallaxFactor > 1` (close layer): `1 - factor` is negative, so layer shifts opposite to camera, making it appear to move faster.

   **Zoom parallax (depth mode):**
   ```ts
   if (mode === "depth") {
     const baseZoom = viewportRef.current.zoom;
     const layerZoom = 1 + (baseZoom - 1) * parallaxFactor;
     const scale = layerZoom / baseZoom;
     mesh.scale.set(scale * (autoScale ?? 1), scale * (autoScale ?? 1), 1);
   }
   ```
   - At zoom=1, `layerZoom=1`, scale=1 — no difference.
   - As zoom increases, closer layers (factor>1) scale more, farther layers (factor<1) scale less.

   **Zoom parallax (drift mode):**
   ```ts
   if (mode === "drift") {
     // Position offset increases with zoom
     const zoomDrift = (viewportRef.current.zoom - 1) * (parallaxFactor - 1) * driftStrength;
     // Add to position offset directionally from center
     mesh.position.x += viewportRef.current.x * zoomDrift;
     mesh.position.y += viewportRef.current.y * zoomDrift;
   }
   ```

## Step 5: Wire Everything in MapScene

**File:** `packages/interactive-map/src/components/MapScene.tsx`

1. Accept new props: `parallaxConfig` and `baseLayerZIndex`.

2. Create a `viewportRef` using `useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 1 })`.

3. Pass an `onViewportChange` callback to `CameraController` that updates `viewportRef.current`.

4. For each layer, compute:
   - `parallaxFactor` using `computeParallaxFactor(layer, baseLayerZIndex, resolvedIntensity)`
   - Pass `parallaxFactor`, `parallaxMode`, parallax-related zoom/frustum config, and `viewportRef` to `MapLayerMesh`.
   - **Do NOT compute `autoScale` here** — it requires layer texture dimensions which are only available inside `MapLayerMesh` after the texture loads.

5. The base layer always gets `parallaxFactor=1.0`.

## Step 6: Wire Props in InteractiveMap

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Destructure `parallaxConfig` from props.

2. Resolve defaults:
   ```ts
   const resolvedParallaxConfig = parallaxConfig
     ? {
         intensity: parallaxConfig.intensity ?? 0.3,
         mode: parallaxConfig.mode ?? "depth",
       }
     : undefined;
   ```

3. Compute `baseLayerZIndex` from the resolved base layer.

4. Pass `parallaxConfig` (resolved) and `baseLayerZIndex` down to `MapScene`.

## Step 7: Export Types

**File:** `packages/interactive-map/src/index.ts` (or wherever the public API is exported)

1. Export `ParallaxConfig` from the types so consumers can import it.

## Step 8: Update Demo

**File:** `apps/demo/src/app/page.tsx`

1. Add `parallaxConfig` to the `InteractiveMap` usage:
   ```tsx
   <InteractiveMap
     layers={layers}
     baseLayerId="base"
     panConfig={{ enabled: true, easingFactor: 0.15 }}
     zoomConfig={{ enabled: true, minZoom: 1, maxZoom: 2, initialZoom: 1 }}
     parallaxConfig={{ intensity: 0.3, mode: "depth" }}
   />
   ```

## Step 9: Cleanup Dead Code

**File:** `packages/interactive-map/src/hooks/useLayerAnimation.ts`

1. Since `MapLayerMesh` was refactored to inline animation logic (calling `computeAnimations` and `resolveEasing` directly in a `useFrame`), the `useLayerAnimation` hook is no longer imported anywhere.
2. Delete the file `packages/interactive-map/src/hooks/useLayerAnimation.ts`.
3. Verify no other files import from it.

# Acceptance Criteria

- [ ] When `parallaxConfig` is **not** provided, behavior is identical to current (no parallax, no regressions).
- [ ] When `parallaxConfig` is provided:
  - [ ] The base layer (identified by `baseLayerId`) always moves at factor 1.0.
  - [ ] Layers with lower zIndex than base move slower on pan.
  - [ ] Layers with higher zIndex than base move faster on pan.
  - [ ] In `"depth"` mode, closer layers zoom in faster than the base.
  - [ ] In `"drift"` mode, layers spread apart positionally on zoom without scale differences.
- [ ] No empty edges are visible on any layer at any pan/zoom position.
- [ ] Per-layer `parallaxFactor` override works and takes precedence over auto-calculation.
- [ ] Global `intensity` multiplier scales the parallax strength proportionally.
- [ ] Animations (bounce, wobble, fade, carousel) continue to work correctly alongside parallax.
- [ ] Touch pinch-to-zoom parallax works the same as scroll wheel zoom.
- [ ] Performance: no noticeable frame drops compared to non-parallax mode.

# Log
- 2026-02-18: Plan created.
- 2026-02-18: Post-review fixes added:
  1. **Bug fix:** `computeAutoScaleFactor` must use layer's own texture dimensions (`layerWidth`/`layerHeight`) instead of `baseWidth`/`baseHeight` for the final ratio. Moved `autoScale` computation into `MapLayerMesh` where texture dimensions are available.
  2. **Cleanup:** Added Step 9 to delete orphaned `useLayerAnimation` hook (replaced by inline `useFrame` logic in `MapLayerMesh`).
