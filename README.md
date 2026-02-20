# Interactive Map Workspace

Monorepo for a reusable interactive map component built with React + Three.js, plus a Next.js demo app.

## Packages

- `packages/interactive-map`: Core component library (`@interactive-map/core`)
- `apps/demo`: Demo app used to preview and test interactions/animations

## Prerequisites

- Node.js 18+
- pnpm 9+

## Getting Started

```bash
pnpm install
pnpm dev
```

This starts the demo app (`apps/demo`) in development mode.

## Current Features

- Layered PNG rendering with Three.js (orthographic, pixel-aligned world space)
- Pan controls with boundary clamping
- Zoom controls (wheel + pinch) with min/max bounds
- Layer animations: `bounce`, `carousel`, `fade`, `wobble`
- Easing presets + custom cubic-bezier easing

## Project Structure

```text
apps/
  demo/                   # Next.js demo
packages/
  interactive-map/        # @interactive-map/core
docs/
  plans/done/             # Completed implementation plans
```

## Scripts

- `pnpm dev`: Run demo app

## Use In Another Project

Use this package as `@interactive-map/core`.

Right now, the package is marked `private` in this repository, so the practical way to consume it is as a local workspace dependency (or after publishing it from your own registry).

### Option 1: Local/Workspace Dependency (current setup)

If your app lives in the same monorepo:

```bash
pnpm add @interactive-map/core --filter your-app
```

Then use it in a client component:

```tsx
"use client";

import { InteractiveMap } from "@interactive-map/core";
import type { MapLayer } from "@interactive-map/core";

const layers: MapLayer[] = [{ id: "base", src: "/base-map.png", zIndex: 0 }];

export default function MapPage() {
  return <InteractiveMap layers={layers} />;
}
```

### Option 2: Private Package In Another Repo (without publishing)

If your app is in a different repository and this package is still private, use one of these approaches:

1. `pnpm link` for active local development between two repos.

In this repo:

```bash
cd packages/interactive-map
pnpm link --global
```

In the other repo:

```bash
pnpm link --global @interactive-map/core
pnpm add three @react-three/fiber @react-three/drei
```

2. `pnpm pack` + install tarball for a reproducible private handoff.

In this repo:

```bash
cd packages/interactive-map
pnpm pack
```

In the other repo (point to the generated `.tgz` path):

```bash
pnpm add /absolute/path/to/interactive-map-core-<version>.tgz
pnpm add three @react-three/fiber @react-three/drei
```

3. Private Git dependency (recommended only if you split `packages/interactive-map` into its own private repo):

```bash
pnpm add git+ssh://git@github.com/<org>/interactive-map-core.git#<branch-or-tag>
pnpm add three @react-three/fiber @react-three/drei
```

Peer dependencies required by your app:
- `react` (18 or 19)
- `react-dom` (18 or 19)

### Option 3: After Publishing The Package

If you publish `@interactive-map/core` to npm/GitHub Packages/private registry, install it in any React app with:

```bash
pnpm add @interactive-map/core three @react-three/fiber @react-three/drei
```

Peer dependencies required by your app:
- `react` (18 or 19)
- `react-dom` (18 or 19)

For full configuration details, see `packages/interactive-map/README.md`.
