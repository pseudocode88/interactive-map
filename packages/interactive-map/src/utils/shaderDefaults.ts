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
