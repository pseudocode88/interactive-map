export const PARTICLE_VERTEX_SHADER = `
attribute float alpha;
attribute float particleSize;
varying float vAlpha;

uniform float uOpacity;

void main() {
  vAlpha = alpha * uOpacity;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = particleSize;
}
`;

export const PARTICLE_FRAGMENT_SHADER_CIRCLE = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  if (dot(center, center) > 0.25) discard;
  gl_FragColor = vec4(uColor, vAlpha);
}
`;

export const PARTICLE_FRAGMENT_SHADER_TEXTURE = `
uniform vec3 uColor;
uniform sampler2D uTexture;
varying float vAlpha;

void main() {
  vec4 texColor = texture2D(uTexture, gl_PointCoord);
  gl_FragColor = vec4(uColor * texColor.rgb, texColor.a * vAlpha);
}
`;

/**
 * Soft glow: smooth radial gradient from center (firefly effect).
 * Uses a squared smoothstep falloff for a natural, gentle luminance.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_SOFT = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
  intensity = pow(intensity, 2.0);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;

/**
 * Bloom glow: bright core with wide halo (magical orb / HDR bloom effect).
 * Renders a sharp bright centre and a softer, wider halo that bleeds outward.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.3, dist);
  core = pow(core, 3.0);
  float halo = 1.0 - smoothstep(0.0, 1.2, dist);
  halo = pow(halo, 1.5) * 0.6;
  float intensity = max(core, halo);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;

/**
 * Pulse glow: softer falloff suited for size/alpha breathing animation.
 * The actual pulse animation is driven CPU-side via size and alpha modulation.
 */
export const PARTICLE_FRAGMENT_SHADER_GLOW_PULSE = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center) * 2.0;
  float intensity = 1.0 - smoothstep(0.0, 1.0, dist);
  intensity = pow(intensity, 2.5);
  gl_FragColor = vec4(uColor, vAlpha * intensity);
}
`;
