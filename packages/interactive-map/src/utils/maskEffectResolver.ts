import type {
  MaskChannel,
  MaskChannelEffect,
  MaskEffectConfig,
  ParticleEffectConfig,
  PinnedEffects,
  PinnedParticleEffectConfig,
  PinnedShaderEffectConfig,
  ShaderEffectConfig,
} from "../types";

interface ResolvedMaskEffects {
  shaderEffects: ShaderEffectConfig[];
  particleEffects: ParticleEffectConfig[];
  /** Map of layerId -> pinned effects for that layer */
  pinnedEffects: Map<string, PinnedEffects>;
}

const CHANNELS: { key: "red" | "green" | "blue"; channel: MaskChannel }[] = [
  { key: "red", channel: "r" },
  { key: "green", channel: "g" },
  { key: "blue", channel: "b" },
];

function resolveParticleEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Extract<MaskChannelEffect, { type: "particles" }>
): ParticleEffectConfig {
  return {
    ...channelEffect.config,
    id: `${config.id}-${key}-particles`,
    maskSrc: config.src,
    maskChannel: channel,
    maskBehavior: config.maskBehavior ?? "both",
    maskThreshold: config.maskThreshold ?? 0.1,
    zIndex: (config.zIndex ?? 12) + 0.001,
    parallaxFactor: config.parallaxFactor,
  };
}

function resolveShaderEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Exclude<MaskChannelEffect, { type: "particles" }>
): ShaderEffectConfig {
  return {
    id: `${config.id}-${key}-shader`,
    preset: channelEffect.preset,
    presetParams: channelEffect.presetParams,
    fragmentShader: channelEffect.fragmentShader,
    vertexShader: channelEffect.vertexShader,
    uniforms: channelEffect.uniforms,
    src: channelEffect.src,
    maskSrc: config.src,
    maskChannel: channel,
    space: config.space ?? "map",
    zIndex: config.zIndex ?? 12,
    parallaxFactor: config.parallaxFactor,
    transparent: config.transparent ?? true,
  };
}

function resolvePinnedParticleEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Extract<MaskChannelEffect, { type: "particles" }>
): PinnedParticleEffectConfig {
  return {
    id: `${config.id}-${key}-particles`,
    mode: channelEffect.config.mode,
    maxCount: channelEffect.config.maxCount,
    color: channelEffect.config.color,
    size: channelEffect.config.size,
    sizeVariance: channelEffect.config.sizeVariance,
    src: channelEffect.config.src,
    twinkleDuration: channelEffect.config.twinkleDuration,
    twinkleDurationVariance: channelEffect.config.twinkleDurationVariance,
    driftDirection: channelEffect.config.driftDirection,
    driftDirectionVariance: channelEffect.config.driftDirectionVariance,
    driftSpeed: channelEffect.config.driftSpeed,
    driftSpeedVariance: channelEffect.config.driftSpeedVariance,
    driftDistance: channelEffect.config.driftDistance,
    glowStyle: channelEffect.config.glowStyle,
    glowMovement: channelEffect.config.glowMovement,
    glowDuration: channelEffect.config.glowDuration,
    glowDurationVariance: channelEffect.config.glowDurationVariance,
    opacity: channelEffect.config.opacity,
    maskSrc: config.src,
    maskChannel: channel,
    maskBehavior: config.maskBehavior ?? "both",
    maskThreshold: config.maskThreshold ?? 0.1,
    localZOffset: 0.002,
  };
}

function resolvePinnedShaderEffect(
  config: MaskEffectConfig,
  key: "red" | "green" | "blue",
  channel: MaskChannel,
  channelEffect: Exclude<MaskChannelEffect, { type: "particles" }>
): PinnedShaderEffectConfig {
  return {
    id: `${config.id}-${key}-shader`,
    preset: channelEffect.preset,
    presetParams: channelEffect.presetParams,
    fragmentShader: channelEffect.fragmentShader,
    vertexShader: channelEffect.vertexShader,
    uniforms: channelEffect.uniforms,
    src: channelEffect.src,
    maskSrc: config.src,
    maskChannel: channel,
    transparent: config.transparent ?? true,
    localZOffset: 0.001,
  };
}

/**
 * Resolves a MaskEffectConfig into individual ShaderEffectConfig and ParticleEffectConfig objects.
 * Each channel definition becomes either a shader effect or particle effect with the
 * appropriate maskSrc and maskChannel fields set automatically.
 */
export function resolveMaskEffects(config: MaskEffectConfig): ResolvedMaskEffects {
  const shaderEffects: ShaderEffectConfig[] = [];
  const particleEffects: ParticleEffectConfig[] = [];
  const pinnedEffects = new Map<string, PinnedEffects>();
  const isPinned = !!config.pinnedTo;

  for (const { key, channel } of CHANNELS) {
    const channelEffect: MaskChannelEffect | undefined = config[key];
    if (!channelEffect) {
      continue;
    }

    if (isPinned) {
      const layerId = config.pinnedTo!;
      if (!pinnedEffects.has(layerId)) {
        pinnedEffects.set(layerId, { shaderEffects: [], particleEffects: [] });
      }

      const layerEffects = pinnedEffects.get(layerId)!;
      if (channelEffect.type === "particles") {
        layerEffects.particleEffects.push(
          resolvePinnedParticleEffect(config, key, channel, channelEffect)
        );
      } else {
        layerEffects.shaderEffects.push(
          resolvePinnedShaderEffect(config, key, channel, channelEffect)
        );
      }
      continue;
    }

    if (channelEffect.type === "particles") {
      particleEffects.push(resolveParticleEffect(config, key, channel, channelEffect));
      continue;
    }

    shaderEffects.push(resolveShaderEffect(config, key, channel, channelEffect));
  }

  return { shaderEffects, particleEffects, pinnedEffects };
}

/**
 * Resolves an array of MaskEffectConfig into merged shader and particle effect arrays.
 */
export function resolveAllMaskEffects(configs: MaskEffectConfig[]): ResolvedMaskEffects {
  const allShaderEffects: ShaderEffectConfig[] = [];
  const allParticleEffects: ParticleEffectConfig[] = [];
  const allPinnedEffects = new Map<string, PinnedEffects>();

  for (const config of configs) {
    const resolved = resolveMaskEffects(config);
    allShaderEffects.push(...resolved.shaderEffects);
    allParticleEffects.push(...resolved.particleEffects);

    for (const [layerId, pinned] of resolved.pinnedEffects) {
      if (!allPinnedEffects.has(layerId)) {
        allPinnedEffects.set(layerId, { shaderEffects: [], particleEffects: [] });
      }

      const existing = allPinnedEffects.get(layerId)!;
      existing.shaderEffects.push(...pinned.shaderEffects);
      existing.particleEffects.push(...pinned.particleEffects);
    }
  }

  return {
    shaderEffects: allShaderEffects,
    particleEffects: allParticleEffects,
    pinnedEffects: allPinnedEffects,
  };
}
