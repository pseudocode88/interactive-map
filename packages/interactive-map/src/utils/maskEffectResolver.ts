import type {
  MaskChannel,
  MaskChannelEffect,
  MaskEffectConfig,
  ParticleEffectConfig,
  ShaderEffectConfig,
} from "../types";

interface ResolvedMaskEffects {
  shaderEffects: ShaderEffectConfig[];
  particleEffects: ParticleEffectConfig[];
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

/**
 * Resolves a MaskEffectConfig into individual ShaderEffectConfig and ParticleEffectConfig objects.
 * Each channel definition becomes either a shader effect or particle effect with the
 * appropriate maskSrc and maskChannel fields set automatically.
 */
export function resolveMaskEffects(config: MaskEffectConfig): ResolvedMaskEffects {
  const shaderEffects: ShaderEffectConfig[] = [];
  const particleEffects: ParticleEffectConfig[] = [];

  for (const { key, channel } of CHANNELS) {
    const channelEffect: MaskChannelEffect | undefined = config[key];
    if (!channelEffect) {
      continue;
    }

    if (channelEffect.type === "particles") {
      particleEffects.push(resolveParticleEffect(config, key, channel, channelEffect));
      continue;
    }

    shaderEffects.push(resolveShaderEffect(config, key, channel, channelEffect));
  }

  return { shaderEffects, particleEffects };
}

/**
 * Resolves an array of MaskEffectConfig into merged shader and particle effect arrays.
 */
export function resolveAllMaskEffects(configs: MaskEffectConfig[]): ResolvedMaskEffects {
  const allShaderEffects: ShaderEffectConfig[] = [];
  const allParticleEffects: ParticleEffectConfig[] = [];

  for (const config of configs) {
    const resolved = resolveMaskEffects(config);
    allShaderEffects.push(...resolved.shaderEffects);
    allParticleEffects.push(...resolved.particleEffects);
  }

  return {
    shaderEffects: allShaderEffects,
    particleEffects: allParticleEffects,
  };
}
