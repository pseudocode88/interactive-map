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

