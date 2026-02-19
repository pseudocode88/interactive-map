import type { MaskChannel, ParticleEffectConfig } from "../types";
import type { MaskSampler } from "./maskSampler";

export interface ParticleInstance {
  /** Position within the region (local coords, origin = region top-left) */
  x: number;
  y: number;
  /** Per-particle size (base size with variance applied) */
  size: number;
  /** Current alpha (0–1), computed each frame */
  alpha: number;
  /** Phase offset (0–1) so particles don't all sync */
  phase: number;
  /** Twinkle: cycle duration for this particle (with variance) */
  cycleDuration: number;
  /** Drift: direction vector (normalized, with per-instance variance) */
  dx: number;
  dy: number;
  /** Drift: speed in px/sec (with variance) */
  speed: number;
  /** Drift: total distance traveled so far */
  distanceTraveled: number;
  /** Drift: max distance before respawn */
  maxDistance: number;
  /** Elapsed time accumulator for this particle */
  elapsed: number;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeDirection(direction: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(direction.x, direction.y);
  if (length === 0) {
    return { x: 0, y: 1 };
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

function resolveParticleDirection(config: ParticleEffectConfig): { dx: number; dy: number } {
  const base = normalizeDirection(config.driftDirection ?? { x: 0, y: 1 });
  const variance = config.driftDirectionVariance ?? 15;
  const angle = randomInRange(-variance, variance);
  const rotated = rotateDirection(base, angle);
  const normalized = normalizeDirection(rotated);

  return { dx: normalized.x, dy: normalized.y };
}

function wrapCoordinate(value: number, size: number): number {
  if (size <= 0) {
    return 0;
  }

  return ((value % size) + size) % size;
}

function sampleMaskAtParticle(
  particleX: number,
  particleY: number,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel
): number {
  const safeWidth = Math.max(regionWidth, 1);
  const safeHeight = Math.max(regionHeight, 1);
  const maskX = (particleX / safeWidth) * sampler.width;
  const maskY = (particleY / safeHeight) * sampler.height;
  return sampler.sample(maskX, maskY, channel);
}

function randomizeDriftMotion(particle: ParticleInstance, config: ParticleEffectConfig): void {
  const { dx, dy } = resolveParticleDirection(config);
  const baseSpeed = config.driftSpeed ?? 30;
  const speedVariance = config.driftSpeedVariance ?? 0.3;
  const speedModifier = 1 + randomInRange(-speedVariance, speedVariance);

  particle.dx = dx;
  particle.dy = dy;
  particle.speed = Math.max(1, baseSpeed * speedModifier);
}

export function createParticle(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number
): ParticleInstance {
  const baseSize = config.mode === "glow" ? (config.size ?? 8) : (config.size ?? 3);
  const sizeVariance = config.sizeVariance ?? 0.3;
  const sizeModifier = 1 + randomInRange(-sizeVariance, sizeVariance);

  const twinkleDuration = config.twinkleDuration ?? 2;
  const twinkleVariance = config.twinkleDurationVariance ?? 0.5;
  let cycleDuration = Math.max(
    0.1,
    twinkleDuration * (1 + randomInRange(-twinkleVariance, twinkleVariance))
  );
  if (config.mode === "glow") {
    const glowDuration = config.glowDuration ?? 3;
    const glowVariance = config.glowDurationVariance ?? 0.4;
    cycleDuration = Math.max(
      0.1,
      glowDuration * (1 + randomInRange(-glowVariance, glowVariance))
    );
  }

  const particle: ParticleInstance = {
    x: randomInRange(0, Math.max(regionWidth, 0)),
    y: randomInRange(0, Math.max(regionHeight, 0)),
    size: Math.max(0.5, baseSize * sizeModifier),
    alpha: 0,
    phase: Math.random(),
    cycleDuration,
    dx: 0,
    dy: 1,
    speed: config.driftSpeed ?? 30,
    distanceTraveled: 0,
    maxDistance: Math.max(1, config.driftDistance ?? 100),
    elapsed: 0,
  };

  randomizeDriftMotion(particle, config);

  return particle;
}

export function initializeParticles(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  count: number
): ParticleInstance[] {
  const safeCount = Math.max(0, Math.floor(count));
  const particles = Array.from({ length: safeCount }, () =>
    createParticle(config, regionWidth, regionHeight)
  );

  const mode = config.mode ?? "twinkle";
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];

    if (mode === "twinkle") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      particle.alpha = Math.sin(t * Math.PI);
      continue;
    }

    if (mode === "glow") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      const glowStyle = config.glowStyle ?? "all";

      if (glowStyle === "pulse" || glowStyle === "all") {
        const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        particle.alpha = 0.3 + pulseFactor * 0.7;
      } else {
        particle.alpha = 1;
      }

      if (config.glowMovement === "drift") {
        particle.distanceTraveled = particle.phase * particle.maxDistance;
        particle.x = wrapCoordinate(
          particle.x + particle.dx * particle.distanceTraveled,
          regionWidth
        );
        particle.y = wrapCoordinate(
          particle.y + particle.dy * particle.distanceTraveled,
          regionHeight
        );
      }
      continue;
    }

    particle.distanceTraveled = particle.phase * particle.maxDistance;
    particle.x = wrapCoordinate(
      particle.x + particle.dx * particle.distanceTraveled,
      regionWidth
    );
    particle.y = wrapCoordinate(
      particle.y + particle.dy * particle.distanceTraveled,
      regionHeight
    );
    particle.alpha = clamp(1 - particle.distanceTraveled / particle.maxDistance, 0, 1);
  }

  return particles;
}

export function createMaskedParticle(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1,
  maxAttempts: number = 30
): ParticleInstance {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const particle = createParticle(config, regionWidth, regionHeight);
    const maskValue = sampleMaskAtParticle(
      particle.x,
      particle.y,
      regionWidth,
      regionHeight,
      sampler,
      channel
    );
    if (maskValue >= threshold) {
      return particle;
    }
  }

  return createParticle(config, regionWidth, regionHeight);
}

export function initializeMaskedParticles(
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  count: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): ParticleInstance[] {
  const safeCount = Math.max(0, Math.floor(count));
  const particles = Array.from({ length: safeCount }, () =>
    createMaskedParticle(config, regionWidth, regionHeight, sampler, channel, threshold)
  );

  const mode = config.mode ?? "twinkle";
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];

    if (mode === "twinkle") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      particle.alpha = Math.sin(t * Math.PI);
      continue;
    }

    if (mode === "glow") {
      particle.elapsed = particle.phase * particle.cycleDuration;
      const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
      const glowStyle = config.glowStyle ?? "all";

      if (glowStyle === "pulse" || glowStyle === "all") {
        const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        particle.alpha = 0.3 + pulseFactor * 0.7;
      } else {
        particle.alpha = 1;
      }

      if (config.glowMovement === "drift") {
        particle.distanceTraveled = particle.phase * particle.maxDistance;
        particle.x = wrapCoordinate(
          particle.x + particle.dx * particle.distanceTraveled,
          regionWidth
        );
        particle.y = wrapCoordinate(
          particle.y + particle.dy * particle.distanceTraveled,
          regionHeight
        );
      }
      continue;
    }

    particle.distanceTraveled = particle.phase * particle.maxDistance;
    particle.x = wrapCoordinate(
      particle.x + particle.dx * particle.distanceTraveled,
      regionWidth
    );
    particle.y = wrapCoordinate(
      particle.y + particle.dy * particle.distanceTraveled,
      regionHeight
    );
    particle.alpha = clamp(1 - particle.distanceTraveled / particle.maxDistance, 0, 1);
  }

  return particles;
}

export function isParticleInMask(
  particle: ParticleInstance,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): boolean {
  const maskValue = sampleMaskAtParticle(
    particle.x,
    particle.y,
    regionWidth,
    regionHeight,
    sampler,
    channel
  );
  return maskValue >= threshold;
}

export function updateTwinkleParticle(
  particle: ParticleInstance,
  delta: number,
  regionWidth: number,
  regionHeight: number
): void {
  particle.elapsed += delta;

  const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
  if (completedCycles > 0) {
    particle.elapsed -= completedCycles * particle.cycleDuration;
    particle.x = randomInRange(0, Math.max(regionWidth, 0));
    particle.y = randomInRange(0, Math.max(regionHeight, 0));
  }

  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  particle.alpha = Math.sin(t * Math.PI);
}

export function updateMaskedTwinkleParticle(
  particle: ParticleInstance,
  delta: number,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  particle.elapsed += delta;

  const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
  if (completedCycles > 0) {
    particle.elapsed -= completedCycles * particle.cycleDuration;
    const maxAttempts = 30;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      particle.x = randomInRange(0, Math.max(regionWidth, 0));
      particle.y = randomInRange(0, Math.max(regionHeight, 0));
      if (
        sampleMaskAtParticle(
          particle.x,
          particle.y,
          regionWidth,
          regionHeight,
          sampler,
          channel
        ) >= threshold
      ) {
        break;
      }
    }
  }

  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  particle.alpha = Math.sin(t * Math.PI);
}

export function updateDriftParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number
): void {
  const distanceDelta = particle.speed * delta;

  particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
  particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
  particle.distanceTraveled += distanceDelta;
  particle.alpha = clamp(1 - particle.distanceTraveled / particle.maxDistance, 0, 1);

  if (particle.distanceTraveled < particle.maxDistance) {
    return;
  }

  particle.x = randomInRange(0, Math.max(regionWidth, 0));
  particle.y = randomInRange(0, Math.max(regionHeight, 0));
  particle.distanceTraveled = 0;
  particle.maxDistance = Math.max(1, config.driftDistance ?? 100);
  particle.elapsed = 0;
  randomizeDriftMotion(particle, config);
  particle.alpha = 1;
}

export function updateMaskedDriftParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  const distanceDelta = particle.speed * delta;

  particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
  particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
  particle.distanceTraveled += distanceDelta;
  particle.alpha = clamp(1 - particle.distanceTraveled / particle.maxDistance, 0, 1);

  const outsideMask = !isParticleInMask(
    particle,
    regionWidth,
    regionHeight,
    sampler,
    channel,
    threshold
  );
  const distanceExhausted = particle.distanceTraveled >= particle.maxDistance;

  if (!outsideMask && !distanceExhausted) {
    return;
  }

  const next = createMaskedParticle(
    config,
    regionWidth,
    regionHeight,
    sampler,
    channel,
    threshold
  );
  particle.x = next.x;
  particle.y = next.y;
  particle.distanceTraveled = 0;
  particle.maxDistance = Math.max(1, config.driftDistance ?? 100);
  particle.elapsed = 0;
  particle.dx = next.dx;
  particle.dy = next.dy;
  particle.speed = next.speed;
  particle.alpha = 1;
}

export function updateGlowParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number
): void {
  particle.elapsed += delta;

  const glowMovement = config.glowMovement ?? "stationary";
  if (glowMovement === "drift") {
    const distanceDelta = particle.speed * delta;
    particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
    particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
    particle.distanceTraveled += distanceDelta;
  }

  const glowStyle = config.glowStyle ?? "all";
  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  if (glowStyle === "pulse" || glowStyle === "all") {
    const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    particle.alpha = 0.3 + pulseFactor * 0.7;
  } else {
    particle.alpha = 1;
  }

  if (glowMovement === "stationary") {
    const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
    if (completedCycles > 0) {
      particle.elapsed -= completedCycles * particle.cycleDuration;
      particle.x = randomInRange(0, Math.max(regionWidth, 0));
      particle.y = randomInRange(0, Math.max(regionHeight, 0));
    }
    return;
  }

  if (particle.distanceTraveled >= particle.maxDistance) {
    particle.x = randomInRange(0, Math.max(regionWidth, 0));
    particle.y = randomInRange(0, Math.max(regionHeight, 0));
    particle.distanceTraveled = 0;
    particle.elapsed = 0;
    randomizeDriftMotion(particle, config);
    particle.alpha = glowStyle === "pulse" || glowStyle === "all" ? 0.3 : 1;
  }
}

export function updateMaskedGlowParticle(
  particle: ParticleInstance,
  delta: number,
  config: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number,
  sampler: MaskSampler,
  channel: MaskChannel,
  threshold: number = 0.1
): void {
  particle.elapsed += delta;

  const glowMovement = config.glowMovement ?? "stationary";
  if (glowMovement === "drift") {
    const distanceDelta = particle.speed * delta;
    particle.x = wrapCoordinate(particle.x + particle.dx * distanceDelta, regionWidth);
    particle.y = wrapCoordinate(particle.y + particle.dy * distanceDelta, regionHeight);
    particle.distanceTraveled += distanceDelta;

    const outsideMask = !isParticleInMask(
      particle,
      regionWidth,
      regionHeight,
      sampler,
      channel,
      threshold
    );
    if (outsideMask || particle.distanceTraveled >= particle.maxDistance) {
      const next = createMaskedParticle(
        config,
        regionWidth,
        regionHeight,
        sampler,
        channel,
        threshold
      );
      particle.x = next.x;
      particle.y = next.y;
      particle.distanceTraveled = 0;
      particle.elapsed = 0;
      particle.dx = next.dx;
      particle.dy = next.dy;
      particle.speed = next.speed;
    }
  }

  const glowStyle = config.glowStyle ?? "all";
  const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
  if (glowStyle === "pulse" || glowStyle === "all") {
    const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
    particle.alpha = 0.3 + pulseFactor * 0.7;
  } else {
    particle.alpha = 1;
  }

  if (glowMovement === "stationary") {
    const completedCycles = Math.floor(particle.elapsed / particle.cycleDuration);
    if (completedCycles > 0) {
      particle.elapsed -= completedCycles * particle.cycleDuration;
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        particle.x = randomInRange(0, Math.max(regionWidth, 0));
        particle.y = randomInRange(0, Math.max(regionHeight, 0));
        if (
          sampleMaskAtParticle(
            particle.x,
            particle.y,
            regionWidth,
            regionHeight,
            sampler,
            channel
          ) >= threshold
        ) {
          break;
        }
      }
    }
  }
}
