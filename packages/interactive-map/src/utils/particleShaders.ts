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
