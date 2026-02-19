import type { MaskChannel } from "../types";
import type { Texture } from "three";

/**
 * Default vertex shader used when LayerShaderConfig.vertexShader is omitted.
 * Passes UV coordinates and renders the textured plane normally.
 */
export const DEFAULT_LAYER_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Builds the set of auto-injected uniforms for a layer shader.
 * Custom uniforms from the user's config are merged on top (user wins on collision).
 */
export function buildLayerShaderUniforms(
  texture: import("three").Texture,
  textureWidth: number,
  textureHeight: number,
  customUniforms?: Record<string, { value: unknown }>
): Record<string, { value: unknown }> {
  const autoUniforms: Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uResolution: { value: [textureWidth, textureHeight] },
    uTexture: { value: texture },
    uViewport: { value: [0, 0, 1] },
  };

  if (customUniforms) {
    return { ...autoUniforms, ...customUniforms };
  }

  return autoUniforms;
}

/**
 * Builds the set of auto-injected uniforms for a standalone shader effect.
 * Unlike layer shaders, uTexture is only included when a texture is provided.
 * Custom uniforms from the user's config are merged on top (user wins on collision).
 */
export function buildStandaloneShaderUniforms(
  quadWidth: number,
  quadHeight: number,
  texture?: import("three").Texture | null,
  customUniforms?: Record<string, { value: unknown }>
): Record<string, { value: unknown }> {
  const autoUniforms: Record<string, { value: unknown }> = {
    uTime: { value: 0 },
    uResolution: { value: [quadWidth, quadHeight] },
    uViewport: { value: [0, 0, 1] },
  };

  if (texture) {
    autoUniforms.uTexture = { value: texture };
  }

  if (customUniforms) {
    return { ...autoUniforms, ...customUniforms };
  }

  return autoUniforms;
}

/**
 * Channel selector vectors for dot-product mask sampling.
 * Using dot(maskColor.rgb, selector) extracts the desired channel without branching.
 */
const MASK_CHANNEL_VECTORS: Record<MaskChannel, [number, number, number]> = {
  r: [1, 0, 0],
  g: [0, 1, 0],
  b: [0, 0, 1],
};

/**
 * Builds mask-related uniforms when a mask texture is provided.
 * Returns an empty object if no mask texture is given.
 *
 * @param maskTexture - The loaded mask texture (or null if not loaded).
 * @param maskChannel - Which channel to sample. Default: "r".
 */
export function buildMaskUniforms(
  maskTexture: Texture | null,
  maskChannel: MaskChannel = "r"
): Record<string, { value: unknown }> {
  if (!maskTexture) {
    return {};
  }

  return {
    uMaskTexture: { value: maskTexture },
    uMaskChannelSelector: { value: MASK_CHANNEL_VECTORS[maskChannel] },
  };
}

/**
 * Prepends `#define HAS_MASK` to a fragment shader source string when a mask is active.
 * This enables `#ifdef HAS_MASK` blocks in shader code.
 *
 * @param fragmentShader - The original fragment shader source.
 * @param hasMask - Whether a mask texture is available.
 */
export function prependMaskDefine(fragmentShader: string, hasMask: boolean): string {
  if (!hasMask) {
    return fragmentShader;
  }
  return "#define HAS_MASK\n" + fragmentShader;
}
