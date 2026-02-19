import type { ShaderPresetName } from "../types";

/**
 * Internal definition for a built-in shader preset.
 */
interface ShaderPresetDefinition {
  /** GLSL fragment shader source. Uses `#ifdef HAS_TEXTURE` for texture/no-texture variants. */
  fragmentShader: string;
  /** GLSL vertex shader source. If null, the default passthrough vertex shader is used. */
  vertexShader: string | null;
  /** Default parameter values for this preset. */
  defaults: Record<string, unknown>;
  /** Whether this preset is designed primarily for use with a texture. */
  requiresTexture: boolean;
}

/**
 * Result of resolving a shader preset.
 */
export interface ResolvedPreset {
  vertexShader: string | null;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

const WATER_RIPPLE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uSpeed;
uniform float uAmplitude;
uniform float uFrequency;
uniform vec4 uWaterColor;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;

  float distX = sin(uv.y * uFrequency + t) * uAmplitude;
  distX += sin(uv.y * uFrequency * 0.5 + t * 1.3) * uAmplitude * 0.5;
  float distY = cos(uv.x * uFrequency + t * 0.7) * uAmplitude;
  distY += cos(uv.x * uFrequency * 0.8 + t * 0.9) * uAmplitude * 0.3;

  vec2 distortedUv = uv + vec2(distX, distY);

  #ifdef HAS_TEXTURE
    gl_FragColor = texture2D(uTexture, distortedUv);
  #else
    float wave1 = sin(uv.x * uFrequency * 2.0 + t) * 0.5 + 0.5;
    float wave2 = cos(uv.y * uFrequency * 1.5 + t * 0.8) * 0.5 + 0.5;
    float wave3 = sin((uv.x + uv.y) * uFrequency + t * 0.6) * 0.5 + 0.5;
    float pattern = (wave1 + wave2 + wave3) / 3.0;
    vec4 color = uWaterColor;
    color.a *= pattern * 0.6 + 0.2;
    gl_FragColor = color;
  #endif
}
`;

const HEAT_HAZE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uSpeed;
uniform float uIntensity;
uniform float uScale;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;

  float distX = sin(uv.y * uScale + t * 1.1) * uIntensity * 0.4;
  distX += sin(uv.y * uScale * 2.3 + t * 0.7) * uIntensity * 0.2;
  float distY = sin(uv.y * uScale * 1.3 + t * 1.2) * uIntensity;
  distY += cos(uv.x * uScale * 0.8 + t * 0.5) * uIntensity * 0.3;

  vec2 distortedUv = uv + vec2(distX, distY);

  #ifdef HAS_TEXTURE
    gl_FragColor = texture2D(uTexture, distortedUv);
  #else
    float haze = sin(uv.y * uScale * 2.0 + t) * 0.5 + 0.5;
    haze *= sin(uv.x * uScale * 1.5 + t * 0.7) * 0.5 + 0.5;
    float shimmer = sin(uv.y * uScale * 4.0 + t * 2.0) * 0.3 + 0.7;
    gl_FragColor = vec4(1.0, 1.0, 1.0, haze * shimmer * uIntensity * 1.5);
  #endif
}
`;

const GLOW_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uIntensity;
uniform vec3 uGlowColor;
uniform float uRadius;
uniform float uPulseSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;
  float pulse = 0.8 + 0.2 * sin(uTime * uPulseSpeed);

  #ifdef HAS_TEXTURE
    vec4 texColor = texture2D(uTexture, uv);
    float brightness = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
    float glowMask = smoothstep(1.0 - uRadius, 1.0, brightness);
    float glow = glowMask * uIntensity * pulse;
    vec3 glowContrib = uGlowColor * glow;
    gl_FragColor = vec4(texColor.rgb + glowContrib, texColor.a);
  #else
    vec2 center = uv - 0.5;
    float dist = length(center);
    float glow = (1.0 - smoothstep(0.0, uRadius, dist)) * uIntensity * pulse;
    gl_FragColor = vec4(uGlowColor * glow, glow);
  #endif
}
`;

const DISSOLVE_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uProgress;
uniform float uEdgeWidth;
uniform vec3 uEdgeColor;
uniform float uNoiseScale;
uniform float uSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUv;

  float progress = uProgress;
  if (uSpeed > 0.0) {
    progress = fract(uTime * uSpeed * 0.1);
  }

  float n = noise(uv * uNoiseScale);
  float dissolve = step(n, progress);
  float edge = smoothstep(progress - uEdgeWidth, progress, n) * (1.0 - dissolve);

  #ifdef HAS_TEXTURE
    vec4 texColor = texture2D(uTexture, uv);
    vec3 finalColor = mix(texColor.rgb, uEdgeColor, edge);
    float alpha = texColor.a * (1.0 - dissolve);
    alpha = max(alpha, edge * 0.8);
    gl_FragColor = vec4(finalColor, alpha);
  #else
    float surface = 0.6 + 0.4 * noise(uv * uNoiseScale * 0.5);
    vec3 baseColor = vec3(surface * 0.5);
    vec3 finalColor = mix(baseColor, uEdgeColor, edge);
    float alpha = (1.0 - dissolve) * 0.8;
    alpha = max(alpha, edge * 0.8);
    gl_FragColor = vec4(finalColor, alpha);
  #endif
}
`;

const CHROMATIC_ABERRATION_FRAGMENT = `
precision mediump float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uViewport;
varying vec2 vUv;

uniform float uOffset;
uniform float uAngle;
uniform float uSpeed;

#ifdef HAS_TEXTURE
uniform sampler2D uTexture;
#endif

void main() {
  vec2 uv = vUv;

  float angle = uAngle + (uSpeed > 0.0 ? uTime * uSpeed : 0.0);
  vec2 dir = vec2(cos(angle), sin(angle)) * uOffset;

  #ifdef HAS_TEXTURE
    float r = texture2D(uTexture, uv + dir).r;
    float g = texture2D(uTexture, uv).g;
    float b = texture2D(uTexture, uv - dir).b;
    float a = texture2D(uTexture, uv).a;
    gl_FragColor = vec4(r, g, b, a);
  #else
    vec2 center = uv - 0.5;
    float dist = length(center);
    float ring = smoothstep(0.25, 0.35, dist) * (1.0 - smoothstep(0.35, 0.5, dist));
    float anim = uSpeed > 0.0 ? sin(uTime * uSpeed) * 0.5 + 0.5 : 0.5;
    float r = ring * smoothstep(0.3 - uOffset * (1.0 + anim), 0.35, dist);
    float g = ring;
    float b = ring * (1.0 - smoothstep(0.35, 0.4 + uOffset * (1.0 + anim), dist));
    float a = max(max(r, g), b) * 0.6;
    gl_FragColor = vec4(r * 0.9, g * 0.7, b * 1.0, a);
  #endif
}
`;

const PRESET_REGISTRY: Record<ShaderPresetName, ShaderPresetDefinition> = {
  waterRipple: {
    fragmentShader: WATER_RIPPLE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uSpeed: 1.0,
      uAmplitude: 0.02,
      uFrequency: 10.0,
      uWaterColor: [0.1, 0.3, 0.5, 0.3],
    },
    requiresTexture: false,
  },
  heatHaze: {
    fragmentShader: HEAT_HAZE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uSpeed: 0.5,
      uIntensity: 0.01,
      uScale: 8.0,
    },
    requiresTexture: false,
  },
  glow: {
    fragmentShader: GLOW_FRAGMENT,
    vertexShader: null,
    defaults: {
      uIntensity: 0.8,
      uGlowColor: [1.0, 0.9, 0.6],
      uRadius: 0.3,
      uPulseSpeed: 1.0,
    },
    requiresTexture: false,
  },
  dissolve: {
    fragmentShader: DISSOLVE_FRAGMENT,
    vertexShader: null,
    defaults: {
      uProgress: 0.5,
      uEdgeWidth: 0.05,
      uEdgeColor: [1.0, 0.5, 0.0],
      uNoiseScale: 4.0,
      uSpeed: 0.0,
    },
    requiresTexture: false,
  },
  chromaticAberration: {
    fragmentShader: CHROMATIC_ABERRATION_FRAGMENT,
    vertexShader: null,
    defaults: {
      uOffset: 0.005,
      uAngle: 0.0,
      uSpeed: 0.5,
    },
    requiresTexture: true,
  },
};

/**
 * Resolves a shader preset by name into concrete vertex/fragment shaders and uniforms.
 */
export function resolveShaderPreset(
  presetName: string,
  presetParams?: Record<string, unknown>,
  hasTexture?: boolean
): ResolvedPreset | null {
  const definition = PRESET_REGISTRY[presetName as ShaderPresetName];
  if (!definition) {
    return null;
  }

  const mergedParams = { ...definition.defaults, ...presetParams };
  const uniforms: Record<string, { value: unknown }> = {};

  for (const [key, value] of Object.entries(mergedParams)) {
    uniforms[key] = { value };
  }

  let fragmentShader = definition.fragmentShader;
  if (hasTexture) {
    fragmentShader = "#define HAS_TEXTURE\n" + fragmentShader;
  }

  return {
    vertexShader: definition.vertexShader,
    fragmentShader,
    uniforms,
  };
}
