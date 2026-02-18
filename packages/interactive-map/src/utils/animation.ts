import type {
  BounceAnimation,
  CarouselAnimation,
  FadeAnimation,
  LayerAnimation,
  WobbleAnimation,
} from "../types";
import { resolveEasing } from "./easing";

export interface AnimationResult {
  offsetX: number;
  offsetY: number;
  opacity: number | null;
}

function normalizeDirection(dir: { x: number; y: number }): { x: number; y: number } {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len === 0) {
    return { x: 0, y: 1 };
  }

  return { x: dir.x / len, y: dir.y / len };
}

/**
 * Given elapsed time and cycle duration, returns a ping-pong progress value (0->1->0).
 * One full cycle = duration seconds (0->1->0).
 */
function pingPongProgress(elapsed: number, duration: number): number {
  if (duration <= 0) {
    return 0;
  }

  const cycleProgress = (elapsed % duration) / duration;

  return cycleProgress <= 0.5 ? cycleProgress * 2 : (1 - cycleProgress) * 2;
}

function wrapCentered(value: number, range: number): number {
  if (range <= 0) {
    return 0;
  }

  const halfRange = range / 2;
  const wrapped = ((value + halfRange) % range + range) % range;
  return wrapped - halfRange;
}

export function computeBounce(animation: BounceAnimation, elapsed: number): AnimationResult {
  const direction = normalizeDirection(animation.direction ?? { x: 0, y: 1 });
  const amplitude = animation.amplitude ?? 20;
  const duration = animation.duration ?? 1;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);

  return {
    offsetX: direction.x * amplitude * easedProgress,
    offsetY: direction.y * amplitude * easedProgress,
    opacity: null,
  };
}

export function computeCarousel(
  animation: CarouselAnimation,
  elapsed: number,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number
): AnimationResult {
  const direction = normalizeDirection(animation.direction ?? { x: 1, y: 0 });
  const speed = animation.speed ?? 50;
  const mode = animation.mode ?? "wrap";

  const displacement = elapsed * speed;
  let offsetX = direction.x * displacement;
  let offsetY = direction.y * displacement;

  if (mode === "wrap") {
    const wrapDistX = baseWidth + layerWidth;
    const wrapDistY = baseHeight + layerHeight;

    if (direction.x !== 0) {
      offsetX = wrapCentered(offsetX, wrapDistX);
    }

    if (direction.y !== 0) {
      offsetY = wrapCentered(offsetY, wrapDistY);
    }
  }

  return {
    offsetX,
    offsetY,
    opacity: null,
  };
}

export function computeFade(animation: FadeAnimation, elapsed: number): AnimationResult {
  const minOpacity = animation.minOpacity ?? 0;
  const maxOpacity = animation.maxOpacity ?? 1;
  const duration = animation.duration ?? 2;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);
  const opacity = minOpacity + (maxOpacity - minOpacity) * easedProgress;

  return {
    offsetX: 0,
    offsetY: 0,
    opacity,
  };
}

export function computeWobble(animation: WobbleAnimation, elapsed: number): AnimationResult {
  const offsetConfig = animation.offset ?? { x: 10, y: 0 };
  const duration = animation.duration ?? 2;
  const easingFn = resolveEasing(animation.easing);

  const rawProgress = pingPongProgress(elapsed, duration);
  const easedProgress = easingFn(rawProgress);
  const factor = easedProgress * 2 - 1;

  return {
    offsetX: offsetConfig.x * factor,
    offsetY: offsetConfig.y * factor,
    opacity: null,
  };
}

export function computeAnimations(
  animations: LayerAnimation[],
  elapsed: number,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number
): AnimationResult {
  let totalOffsetX = 0;
  let totalOffsetY = 0;
  let mergedOpacity: number | null = null;

  for (const animation of animations) {
    let result: AnimationResult;

    switch (animation.type) {
      case "bounce": {
        result = computeBounce(animation, elapsed);
        break;
      }
      case "carousel": {
        result = computeCarousel(
          animation,
          elapsed,
          baseWidth,
          baseHeight,
          layerWidth,
          layerHeight
        );
        break;
      }
      case "fade": {
        result = computeFade(animation, elapsed);
        break;
      }
      case "wobble": {
        result = computeWobble(animation, elapsed);
        break;
      }
    }

    totalOffsetX += result.offsetX;
    totalOffsetY += result.offsetY;

    if (result.opacity !== null) {
      mergedOpacity = (mergedOpacity ?? 1) * result.opacity;
    }
  }

  return {
    offsetX: totalOffsetX,
    offsetY: totalOffsetY,
    opacity: mergedOpacity,
  };
}
