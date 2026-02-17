---
Name: Chunk 1 - Project Setup & Scaffolding
Type: Setup
Created On: 2026-02-18
Modified On: 2026-02-18
---

# Brief
Set up the monorepo structure with pnpm workspaces containing two packages: the interactive map component library (`packages/interactive-map`) and a Next.js demo app (`apps/demo`). Configure TypeScript, install core dependencies (React Three Fiber, Three.js, Drei), and verify the demo app can import and render a placeholder from the component package.

# Plan & Instruction

## Step 1: Initialize Root Workspace

1. Create `package.json` at the repo root:
   - `"name": "interactive-map-workspace"`
   - `"private": true`
   - `"scripts"` — leave empty for now
   - `"packageManager": "pnpm@9.x"` (use latest stable pnpm 9)
2. Create `pnpm-workspace.yaml` at the repo root:
   ```yaml
   packages:
     - "packages/*"
     - "apps/*"
   ```
3. Create `tsconfig.base.json` at the repo root with shared compiler options:
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ESNext",
       "moduleResolution": "bundler",
       "jsx": "react-jsx",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "isolatedModules": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true
     }
   }
   ```

## Step 2: Create the Component Package (`packages/interactive-map`)

1. Create directory `packages/interactive-map/`
2. Create `packages/interactive-map/package.json`:
   ```json
   {
     "name": "@interactive-map/core",
     "version": "0.0.1",
     "private": true,
     "main": "./src/index.ts",
     "types": "./src/index.ts",
     "peerDependencies": {
       "react": "^18.0.0 || ^19.0.0",
       "react-dom": "^18.0.0 || ^19.0.0"
     },
     "dependencies": {
       "@react-three/fiber": "^8.x",
       "@react-three/drei": "^9.x",
       "three": "^0.170.x"
     },
     "devDependencies": {
       "@types/three": "^0.170.x",
       "typescript": "^5.x"
     }
   }
   ```
   > Note: Use the latest stable versions available at time of implementation. The versions above are indicative — run `pnpm add <pkg>` without version pinning to get latest.
3. Create `packages/interactive-map/tsconfig.json`:
   ```json
   {
     "extends": "../../tsconfig.base.json",
     "compilerOptions": {
       "outDir": "./dist",
       "rootDir": "./src"
     },
     "include": ["src/**/*"]
   }
   ```
4. Create the following directory structure:
   ```
   packages/interactive-map/src/
   ├── components/
   │   └── InteractiveMap.tsx
   ├── types/
   │   └── index.ts
   └── index.ts
   ```
5. `packages/interactive-map/src/types/index.ts` — Define the initial type stubs:
   ```ts
   export interface MapLayer {
     id: string;
     src: string;       // path to PNG
     zIndex: number;
   }

   export interface InteractiveMapProps {
     layers: MapLayer[];
     width?: string;    // CSS value, e.g. "100%" or "800px"
     height?: string;   // CSS value
     className?: string;
   }
   ```
6. `packages/interactive-map/src/components/InteractiveMap.tsx` — Create a placeholder component:
   ```tsx
   import { Canvas } from "@react-three/fiber";
   import type { InteractiveMapProps } from "../types";

   export function InteractiveMap({ width = "100%", height = "100%", className }: InteractiveMapProps) {
     return (
       <div style={{ width, height }} className={className}>
         <Canvas>
           <mesh>
             <planeGeometry args={[2, 2]} />
             <meshBasicMaterial color="skyblue" />
           </mesh>
         </Canvas>
       </div>
     );
   }
   ```
   > This renders a simple blue plane to verify R3F is working. Will be replaced in Chunk 2.
7. `packages/interactive-map/src/index.ts` — Barrel export:
   ```ts
   export { InteractiveMap } from "./components/InteractiveMap";
   export type { InteractiveMapProps, MapLayer } from "./types";
   ```

## Step 3: Create the Demo App (`apps/demo`)

1. Scaffold a Next.js app inside `apps/demo/`:
   - Run: `pnpm create next-app apps/demo --typescript --app --src-dir --no-tailwind --no-eslint --use-pnpm`
   - If the scaffolder prompts for options: App Router = yes, `src/` directory = yes, Turbopack = yes, import alias = `@/*`
2. Add the component package as a workspace dependency in `apps/demo/package.json`:
   ```json
   "dependencies": {
     "@interactive-map/core": "workspace:*"
   }
   ```
   Then run `pnpm install` from root.
3. Configure `apps/demo/next.config.ts` to transpile the workspace package:
   ```ts
   import type { NextConfig } from "next";

   const nextConfig: NextConfig = {
     transpilePackages: ["@interactive-map/core"],
   };

   export default nextConfig;
   ```
4. Replace the contents of `apps/demo/src/app/page.tsx` with a minimal page that renders the component:
   ```tsx
   import { InteractiveMap } from "@interactive-map/core";

   export default function Home() {
     return (
       <main style={{ width: "100vw", height: "100vh" }}>
         <InteractiveMap layers={[]} />
       </main>
     );
   }
   ```
5. Add a convenience script in the root `package.json`:
   ```json
   "scripts": {
     "dev": "pnpm --filter demo dev"
   }
   ```

## Step 4: Update `.gitignore`

Ensure `.gitignore` at the repo root includes:
```
node_modules/
.next/
dist/
*.tsbuildinfo
.DS_Store
```

## Step 5: Verify Setup

1. Run `pnpm install` from the repo root — should resolve all workspace dependencies without errors.
2. Run `pnpm dev` — the Next.js demo app should start and display the placeholder blue plane from R3F on `http://localhost:3000`.
3. Verify there are no TypeScript errors: `pnpm --filter @interactive-map/core tsc --noEmit`

# Acceptance Criteria

- [ ] Monorepo structure with `packages/interactive-map` and `apps/demo` exists
- [ ] `pnpm install` succeeds from root with no errors
- [ ] `@interactive-map/core` package has React Three Fiber, Drei, and Three.js as dependencies
- [ ] TypeScript is configured and `tsc --noEmit` passes with no errors on the component package
- [ ] Demo Next.js app starts with `pnpm dev` and renders the placeholder `<InteractiveMap />` component (blue plane visible in browser)
- [ ] Component is imported via `@interactive-map/core` workspace dependency (not relative paths)

# Log
- **2026-02-18**: Plan created for Chunk 1 — Project Setup & Scaffolding covering monorepo init, component package skeleton, demo app, and verification steps.
