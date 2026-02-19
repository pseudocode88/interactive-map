export type EasingPreset = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Either a named preset or a custom cubic-bezier tuple [x1, y1, x2, y2].
 * Default is 'ease-in-out' for all animation types.
 */
export type EasingConfig = EasingPreset | [number, number, number, number];

export interface BounceAnimation {
  type: "bounce";
  /** Direction vector for bounce (normalized internally). Default: { x: 0, y: 1 } (vertical) */
  direction?: { x: number; y: number };
  /** Max displacement in pixels along the direction. Default: 20 */
  amplitude?: number;
  /** Duration of one full bounce cycle (up and back) in seconds. Default: 1 */
  duration?: number;
  /** Easing function for the bounce. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface CarouselAnimation {
  type: "carousel";
  /** Direction vector for movement (normalized internally). Default: { x: 1, y: 0 } (rightward) */
  direction?: { x: number; y: number };
  /** Movement speed in pixels per second. Default: 50 */
  speed?: number;
  /**
   * 'wrap' — layer re-enters from the opposite side when it exits base image bounds (seamless loop).
   * 'infinite' — layer keeps moving in one direction forever (eventually leaves visible area).
   * Default: 'wrap'
   */
  mode?: "wrap" | "infinite";
  /** Easing is not applicable for carousel (constant velocity). This field is ignored if provided. */
}

export interface FadeAnimation {
  type: "fade";
  /** Minimum opacity. Default: 0 */
  minOpacity?: number;
  /** Maximum opacity. Default: 1 */
  maxOpacity?: number;
  /** Duration of one full fade cycle (min → max → min) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the fade. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface WobbleAnimation {
  type: "wobble";
  /** Offset from center position in pixels. Layer sways between -offset and +offset. Default: { x: 10, y: 0 } */
  offset?: { x: number; y: number };
  /** Duration of one full wobble cycle (left → right → left) in seconds. Default: 2 */
  duration?: number;
  /** Easing function for the wobble. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export type LayerAnimation =
  | BounceAnimation
  | CarouselAnimation
  | FadeAnimation
  | WobbleAnimation;

/**
 * Custom shader configuration for a map layer.
 * When provided, the layer uses ShaderMaterial instead of meshBasicMaterial.
 *
 * Auto-injected uniforms available in shaders:
 * - uTime (float): elapsed time in seconds
 * - uResolution (vec2): texture dimensions (width, height) in pixels
 * - uTexture (sampler2D): the layer's loaded texture
 * - uViewport (vec3): camera state (x, y, zoom)
 */
export interface LayerShaderConfig {
  /** GLSL vertex shader source. If omitted, a default passthrough vertex shader is used. */
  vertexShader?: string;
  /** GLSL fragment shader source. Required. */
  fragmentShader: string;
  /**
   * Additional custom uniforms to pass to the shader.
   * Values can be numbers, arrays (vec2/vec3/vec4), or Three.js objects (Color, Texture, etc.).
   * These are merged with the auto-injected uniforms (uTime, uResolution, uTexture, uViewport).
   * If a custom uniform name collides with an auto-injected one, the custom value takes precedence.
   */
  uniforms?: Record<string, { value: unknown }>;
  /** Whether the material should use transparent blending. Default: true */
  transparent?: boolean;
  /** Whether to write to the depth buffer. Default: false */
  depthWrite?: boolean;
  /**
   * Optional preset name (for Chunk 7d-3). When set, vertexShader/fragmentShader are ignored
   * and the preset's shaders are used instead.
   * Reserved for future use - not implemented in this chunk.
   */
  preset?: string;
  /**
   * Optional preset-specific parameters (for Chunk 7d-3).
   * Reserved for future use - not implemented in this chunk.
   */
  presetParams?: Record<string, unknown>;
}

export interface MapLayer {
  id: string;
  src: string;
  zIndex: number;
  position?: {
    x?: number;
    y?: number;
  };
  /** Single animation or array of parallel animations. */
  animation?: LayerAnimation | LayerAnimation[];
  /**
   * Override the auto-calculated parallax factor for this layer.
   * 1.0 = moves with camera (base layer speed).
   * < 1.0 = moves slower (feels farther).
   * > 1.0 = moves faster (feels closer).
   * Only used when parallaxConfig is provided on the map.
   */
  parallaxFactor?: number;
  /** Optional custom shader configuration. When provided, the layer renders with ShaderMaterial instead of meshBasicMaterial. */
  shaderConfig?: LayerShaderConfig;
}

export interface PanConfig {
  enabled?: boolean;
  easingFactor?: number;
}

export interface ZoomConfig {
  enabled?: boolean;
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  scrollSpeed?: number;
  easingFactor?: number;
}

export interface ParallaxConfig {
  /** Global multiplier applied to auto-calculated parallax factors. Default: 0.3 */
  intensity?: number;
  /**
   * 'depth' — closer layers scale faster on zoom (pop-out effect).
   * 'drift' — zoom parallax only affects positional offset (layers spread apart).
   * Default: 'depth'
   */
  mode?: "depth" | "drift";
}

export interface MapMarker {
  /** X position in base image pixel coordinates (0 = left edge) */
  x: number;
  /** Y position in base image pixel coordinates (0 = top edge) */
  y: number;
  id: string;
  /** Text shown in tooltip on hover */
  label: string;
  /** Marker dot color (CSS color string). Default: "#ff4444" */
  color?: string;
}

export interface SpriteEffectConfig {
  /** Unique ID for this sprite group */
  id: string;
  /** URL to the sprite sheet image (PNG). Frames are auto-detected as a grid. */
  src: string;
  /** Maximum number of sprites visible at a time. Default: 5 */
  maxCount?: number;
  /** Base movement speed in pixels per second. Default: 80 */
  speed?: number;
  /** Random speed variance factor (0–1). Each sprite gets speed ± speed*variance. Default: 0.2 */
  speedVariance?: number;
  /** General direction of movement as a normalized vector. Default: { x: 1, y: 0 } (left-to-right) */
  direction?: { x: number; y: number };
  /** Random angle variance in degrees applied per-sprite for natural spread. Default: 15 */
  directionVariance?: number;
  /** Vertical oscillation config for natural flight wobble */
  oscillation?: {
    /** Amplitude in pixels (how far up/down the sprite wobbles). Default: 15 */
    amplitude?: number;
    /** Frequency: number of full wobble cycles per second. Default: 0.8 */
    frequency?: number;
  };
  /** Frames per second for sprite sheet animation. Default: 8 */
  fps?: number;
  /** zIndex for depth ordering (same system as MapLayer). Default: 10 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this sprite group.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /** Scale multiplier for individual sprites. Default: 1 */
  scale?: number;
  /** Opacity of sprites (0–1). Default: 1 */
  opacity?: number;
}

export interface FogOpacityPulse {
  /** Minimum opacity during the pulse cycle. Default: 0.3 */
  minOpacity?: number;
  /** Maximum opacity during the pulse cycle. Default: 0.8 */
  maxOpacity?: number;
  /** Duration of one full pulse cycle (min → max → min) in seconds. Default: 4 */
  duration?: number;
  /** Easing function for the opacity pulse. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface FogScaleBreathing {
  /** Maximum additional scale factor above 1.0. Default: 0.1 */
  amplitude?: number;
  /** Duration of one full breathing cycle in seconds. Default: 6 */
  duration?: number;
  /** Easing function for the scale breathing. Default: 'ease-in-out' */
  easing?: EasingConfig;
}

export interface FogEffectConfig {
  /** Unique ID for this fog layer */
  id: string;
  /** URL to the fog texture image. Tileable textures work best. */
  src: string;
  /** Position offset in base image pixel coordinates. Default: { x: 0, y: 0 } */
  position?: { x?: number; y?: number };
  /** Drift direction as a normalized vector. Default: { x: 1, y: 0 } */
  direction?: { x: number; y: number };
  /** Drift speed in pixels per second. Default: 20 */
  speed?: number;
  /** Base opacity of the fog (0–1). Default: 0.5 */
  opacity?: number;
  /** Optional opacity pulse effect. */
  opacityPulse?: FogOpacityPulse;
  /** Optional scale breathing effect. */
  scaleBreathing?: FogScaleBreathing;
  /** zIndex for depth ordering (same system as MapLayer). Default: 9 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this fog layer.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
}

export interface ParticleEffectConfig {
  /** Unique ID for this particle effect */
  id: string;
  /**
   * Visual mode:
   * - 'twinkle': particles appear at random positions, fade in/out, then reappear elsewhere (stationary).
   * - 'drift': particles spawn at random positions, move in a direction while fading out, then respawn.
   * Default: 'twinkle'
   */
  mode?: "twinkle" | "drift";
  /** Maximum number of particles. Default: 50 */
  maxCount?: number;
  /** Particle color as a CSS color string (hex, rgb, etc.). Default: "#ffffff" */
  color?: string;
  /** Base particle size in pixels. Default: 3 */
  size?: number;
  /** Random size variance factor (0–1). Each particle gets size * (1 ± sizeVariance). Default: 0.3 */
  sizeVariance?: number;
  /**
   * Optional PNG texture for particles (e.g., a star/sparkle image).
   * If provided, each particle renders this texture instead of a plain dot.
   * If omitted, particles render as solid colored circles.
   */
  src?: string;
  /**
   * Optional rectangular region in base image pixel coordinates where particles spawn.
   * If omitted, particles cover the entire map (0, 0, baseWidth, baseHeight).
   */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Region coordinate mode:
   * - 'map': use map pixel coordinates (default).
   * - 'container': use current visible container/viewport bounds (full width + height of the view).
   */
  regionMode?: "map" | "container";
  /**
   * Optional layer ID to attach this particle effect to.
   * When set, particles inherit the layer's base position offset and parallax factor.
   * The region (if provided) is relative to the layer's position.
   */
  layerId?: string;
  /** Duration of one twinkle cycle (fade in → hold → fade out) in seconds. Default: 2 */
  twinkleDuration?: number;
  /** Random duration variance factor (0–1). Default: 0.5 */
  twinkleDurationVariance?: number;
  /** Drift direction as a normalized vector. Default: { x: 0, y: 1 } (upward in world space) */
  driftDirection?: { x: number; y: number };
  /** Random angle variance in degrees applied per-particle. Default: 15 */
  driftDirectionVariance?: number;
  /** Drift speed in pixels per second. Default: 30 */
  driftSpeed?: number;
  /** Random speed variance factor (0–1). Default: 0.3 */
  driftSpeedVariance?: number;
  /** How far a particle drifts (in pixels) before it fades out and respawns. Default: 100 */
  driftDistance?: number;
  /** zIndex for depth ordering (same system as MapLayer). Default: 11 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this particle effect.
   * Only used when parallaxConfig is provided on the map AND layerId is NOT set.
   * If layerId is set, the attached layer's parallax factor is used instead.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /** Base opacity multiplier for all particles (0–1). Default: 1 */
  opacity?: number;
}

export interface InteractiveMapProps {
  layers: MapLayer[];
  /** ID of the layer to use as the viewport reference. If not provided, defaults to the layer with the lowest zIndex. */
  baseLayerId?: string;
  width?: string;
  height?: string;
  className?: string;
  panConfig?: PanConfig;
  zoomConfig?: ZoomConfig;
  /** Enable parallax effect. If not provided, parallax is disabled. */
  parallaxConfig?: ParallaxConfig;
  /** Array of markers to display on the map */
  markers?: MapMarker[];
  /** Array of sprite effect configurations (birds, butterflies, etc.) */
  spriteEffects?: SpriteEffectConfig[];
  /** Array of fog effect configurations */
  fogEffects?: FogEffectConfig[];
  /** Array of particle effect configurations (sparkles, embers, fairy dust, etc.) */
  particleEffects?: ParticleEffectConfig[];
  /** Called when a marker is clicked. Receives the marker ID. */
  onMarkerClick?: (markerId: string) => void;
  /**
   * Increment this number to reset viewport to initial load state
   * (initialZoom and centered pan). E.g. set to Date.now() or a counter.
   */
  resetZoomTrigger?: number;
}
