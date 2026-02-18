import type { EasingConfig } from "../types";

const EASING_PRESETS: Record<string, [number, number, number, number]> = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/**
 * Attempt to find t for a given x on a cubic bezier curve using Newton-Raphson.
 * Falls back to binary search if Newton's method doesn't converge.
 */
function solveCubicBezierX(x: number, x1: number, x2: number): number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const currentX = ((ax * t + bx) * t + cx) * t - x;
    if (Math.abs(currentX) < 1e-7) {
      return t;
    }

    const derivative = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(derivative) < 1e-7) {
      break;
    }

    t -= currentX / derivative;
  }

  let lo = 0;
  let hi = 1;
  t = x;

  while (lo < hi) {
    const mid = (lo + hi) / 2;
    const currentX = ((ax * mid + bx) * mid + cx) * mid;

    if (Math.abs(currentX - x) < 1e-7) {
      return mid;
    }

    if (currentX < x) {
      lo = mid;
    } else {
      hi = mid;
    }

    if (hi - lo < 1e-7) {
      break;
    }
  }

  return (lo + hi) / 2;
}

function cubicBezier(t: number, x1: number, y1: number, x2: number, y2: number): number {
  if (t <= 0) {
    return 0;
  }

  if (t >= 1) {
    return 1;
  }

  const solvedT = solveCubicBezierX(t, x1, x2);

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  return ((ay * solvedT + by) * solvedT + cy) * solvedT;
}

export function resolveEasing(config: EasingConfig | undefined): (t: number) => number {
  if (!config) {
    return (t) => cubicBezier(t, 0.42, 0, 0.58, 1);
  }

  if (typeof config === "string") {
    const preset = EASING_PRESETS[config];
    if (config === "linear") {
      return (t) => t;
    }

    return (t) => cubicBezier(t, preset[0], preset[1], preset[2], preset[3]);
  }

  const [x1, y1, x2, y2] = config;
  return (t) => cubicBezier(t, x1, y1, x2, y2);
}
