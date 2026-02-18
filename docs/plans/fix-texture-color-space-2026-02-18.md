---
Name: Fix Texture Color Space
Type: Bug Fix
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
Images rendered on the Three.js canvas appear with higher contrast and saturation than the original source images. This is caused by missing sRGB color space configuration on textures and default tone mapping applied by the renderer.

# Plan & Instruction

## Step 1: Set texture color space to sRGB in MapLayerMesh

**File:** `packages/interactive-map/src/components/MapLayerMesh.tsx`

1. Add `SRGBColorSpace` to the import from `three`:
   ```ts
   import { LinearFilter, Mesh, SRGBColorSpace, TextureLoader } from "three";
   ```
2. Inside the `processedTexture` useMemo (line 30-36), add `texture.colorSpace = SRGBColorSpace;` before `texture.needsUpdate = true;`:
   ```ts
   const processedTexture = useMemo(() => {
     texture.minFilter = LinearFilter;
     texture.magFilter = LinearFilter;
     texture.colorSpace = SRGBColorSpace;
     texture.needsUpdate = true;
     return texture;
   }, [texture]);
   ```

## Step 2: Disable tone mapping on the Canvas renderer

**File:** `packages/interactive-map/src/components/InteractiveMap.tsx`

1. Add `NoToneMapping` to the imports from `three`:
   ```ts
   import { NoToneMapping } from "three";
   ```
2. Update the `gl` prop on the `<Canvas>` component (line 98) to disable tone mapping:
   ```tsx
   gl={{ antialias: true, toneMapping: NoToneMapping }}
   ```

# Acceptance Criteria

- Images on the canvas match the original source image colors (no boosted contrast or saturation)
- Transparent layers still render correctly
- No visual regressions on existing layer animations

# Log
- 2026-02-18: Plan created
