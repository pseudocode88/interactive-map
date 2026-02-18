import type { FogOpacityPulse, FogScaleBreathing } from "../types";

export function computeFogDrift(
  elapsed: number,
  speed: number,
  directionX: number,
  directionY: number,
  textureWidth: number,
  textureHeight: number
): { offsetX: number; offsetY: number } {
  const rawX = elapsed * speed * directionX;
  const rawY = elapsed * speed * directionY;

  const offsetX =
    textureWidth > 0 ? ((rawX % textureWidth) + textureWidth) % textureWidth : 0;
  const offsetY =
    textureHeight > 0 ? ((rawY % textureHeight) + textureHeight) % textureHeight : 0;

  return { offsetX, offsetY };
}

export function computeFogOpacity(
  elapsed: number,
  pulse: Required<Pick<FogOpacityPulse, "minOpacity" | "maxOpacity" | "duration">>,
  easingFn: (t: number) => number
): number {
  const { minOpacity, maxOpacity, duration } = pulse;
  const safeDuration = Math.max(duration, 0.001);
  const phase = (elapsed % safeDuration) / safeDuration;
  const t = (1 - Math.cos(phase * Math.PI * 2)) * 0.5;
  const eased = easingFn(t);
  return minOpacity + (maxOpacity - minOpacity) * eased;
}

export function computeFogScale(
  elapsed: number,
  breathing: Required<Pick<FogScaleBreathing, "amplitude" | "duration">>,
  easingFn: (t: number) => number
): number {
  const { amplitude, duration } = breathing;
  const safeDuration = Math.max(duration, 0.001);
  const phase = (elapsed % safeDuration) / safeDuration;
  const t = (1 - Math.cos(phase * Math.PI * 2)) * 0.5;
  const eased = easingFn(t);
  return 1 + amplitude * eased;
}
