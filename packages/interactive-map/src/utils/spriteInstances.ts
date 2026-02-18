import type { SpriteEffectConfig } from "../types";

export interface SpriteInstance {
  /** Current position in world coordinates */
  x: number;
  y: number;
  /** Movement direction vector (normalized, with per-instance angle variance applied) */
  dx: number;
  dy: number;
  /** This instance's speed in px/sec (base speed with variance applied) */
  speed: number;
  /** Phase offset for oscillation (random, 0–2π) so sprites don't wobble in sync */
  oscillationPhase: number;
  /** Current sprite sheet frame index */
  frame: number;
  /** Accumulator for frame timing */
  frameTimer: number;
  /** Tracked time in seconds for stable oscillation */
  elapsed: number;
  /** Whether this instance is alive/visible */
  alive: boolean;
}

interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function normalizeDirection(direction: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 1, y: 0 };
  }

  return {
    x: direction.x / length,
    y: direction.y / length,
  };
}

function rotateDirection(direction: { x: number; y: number }, angleDegrees: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: direction.x * cos - direction.y * sin,
    y: direction.x * sin + direction.y * cos,
  };
}

function toWorldBounds(baseWidth: number, baseHeight: number): WorldBounds {
  return {
    minX: -baseWidth / 2,
    maxX: baseWidth / 2,
    minY: -baseHeight / 2,
    maxY: baseHeight / 2,
  };
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function buildDirection(config: SpriteEffectConfig): { dx: number; dy: number } {
  const base = normalizeDirection(config.direction ?? { x: 1, y: 0 });
  const variance = config.directionVariance ?? 15;
  const angle = randomInRange(-variance, variance);
  const rotated = rotateDirection(base, angle);
  const normalized = normalizeDirection(rotated);

  return { dx: normalized.x, dy: normalized.y };
}

function resolveSpawnPosition(
  dx: number,
  dy: number,
  baseWidth: number,
  baseHeight: number
): { x: number; y: number } {
  const bounds = toWorldBounds(baseWidth, baseHeight);
  const dominantX = Math.abs(dx) >= Math.abs(dy);

  if (dominantX) {
    return {
      x: dx >= 0 ? bounds.minX : bounds.maxX,
      y: randomInRange(bounds.minY, bounds.maxY),
    };
  }

  return {
    x: randomInRange(bounds.minX, bounds.maxX),
    y: dy >= 0 ? bounds.minY : bounds.maxY,
  };
}

function resolveSpeed(config: SpriteEffectConfig): number {
  const baseSpeed = config.speed ?? 80;
  const variance = config.speedVariance ?? 0.2;
  const modifier = 1 + randomInRange(-variance, variance);

  return Math.max(1, baseSpeed * modifier);
}

export function spawnInstance(
  config: SpriteEffectConfig,
  baseWidth: number,
  baseHeight: number
): SpriteInstance {
  const { dx, dy } = buildDirection(config);
  const spawn = resolveSpawnPosition(dx, dy, baseWidth, baseHeight);

  return {
    x: spawn.x,
    y: spawn.y,
    dx,
    dy,
    speed: resolveSpeed(config),
    oscillationPhase: randomInRange(0, Math.PI * 2),
    frame: 0,
    frameTimer: 0,
    elapsed: 0,
    alive: true,
  };
}

export function updateInstance(
  instance: SpriteInstance,
  delta: number,
  config: SpriteEffectConfig,
  baseWidth: number,
  baseHeight: number,
  frameCount: number,
  frameSize: number
): boolean {
  instance.x += instance.dx * instance.speed * delta;
  instance.y += instance.dy * instance.speed * delta;
  instance.elapsed += delta;

  const fps = Math.max(1, config.fps ?? 8);
  const frameDuration = 1 / fps;

  instance.frameTimer += delta;
  while (instance.frameTimer >= frameDuration) {
    instance.frameTimer -= frameDuration;
    instance.frame = frameCount > 0 ? (instance.frame + 1) % frameCount : 0;
  }

  const bounds = toWorldBounds(baseWidth, baseHeight);
  const margin = frameSize * (config.scale ?? 1);

  return !(
    instance.x < bounds.minX - margin ||
    instance.x > bounds.maxX + margin ||
    instance.y < bounds.minY - margin ||
    instance.y > bounds.maxY + margin
  );
}

export function initializeInstances(
  config: SpriteEffectConfig,
  baseWidth: number,
  baseHeight: number,
  count: number
): SpriteInstance[] {
  const instances = Array.from({ length: count }, () =>
    spawnInstance(config, baseWidth, baseHeight)
  );
  const travelDistance = Math.hypot(baseWidth, baseHeight);
  const bounds = toWorldBounds(baseWidth, baseHeight);

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    const progress = count <= 1 ? 0 : index / (count - 1);
    const jitter = randomInRange(-0.2, 0.2);
    const distance = travelDistance * Math.max(0, Math.min(1, progress + jitter));

    instance.x += instance.dx * distance;
    instance.y += instance.dy * distance;

    instance.x = Math.max(bounds.minX, Math.min(bounds.maxX, instance.x));
    instance.y = Math.max(bounds.minY, Math.min(bounds.maxY, instance.y));
    instance.elapsed = randomInRange(0, 3);
  }

  return instances;
}

export function getOscillationOffset(
  instance: SpriteInstance,
  config: SpriteEffectConfig
): { x: number; y: number } {
  const amplitude = config.oscillation?.amplitude ?? 15;
  const frequency = config.oscillation?.frequency ?? 0.8;
  const oscillation = amplitude * Math.sin(Math.PI * 2 * frequency * instance.elapsed + instance.oscillationPhase);

  return {
    x: -instance.dy * oscillation,
    y: instance.dx * oscillation,
  };
}
