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

/** Available built-in shader preset names */
export type ShaderPresetName =
  | "waterRipple"
  | "heatHaze"
  | "glow"
  | "dissolve"
  | "chromaticAberration";

/** Color channel to sample from a mask texture */
export type MaskChannel = "r" | "g" | "b";

/**
 * Shader effect to apply on a mask channel.
 * Uses the same shader preset / custom shader system as ShaderEffectConfig.
 */
export interface MaskChannelShaderEffect {
  type?: "shader";
  /** Built-in shader preset name */
  preset?: ShaderPresetName;
  /** Preset-specific parameters */
  presetParams?: Record<string, unknown>;
  /** Custom fragment shader (used when preset is not set) */
  fragmentShader?: string;
  /** Custom vertex shader */
  vertexShader?: string;
  /** Additional custom uniforms */
  uniforms?: Record<string, { value: unknown }>;
  /** Optional texture for the shader */
  src?: string;
}

/**
 * Particle effect to apply on a mask channel.
 * Uses the same config shape as ParticleEffectConfig, minus the mask fields
 * (those are automatically set from the parent MaskEffectConfig).
 */
export interface MaskChannelParticleEffect {
  type: "particles";
  config: Omit<
    ParticleEffectConfig,
    "id" | "maskSrc" | "maskChannel" | "maskBehavior" | "maskThreshold"
  >;
}

/** A single channel can have a shader effect, particle effect, or nothing */
export type MaskChannelEffect = MaskChannelShaderEffect | MaskChannelParticleEffect;

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
  /** GLSL fragment shader source. Required when `preset` is not set. */
  fragmentShader?: string;
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
   * Built-in shader preset name. When set, the preset's vertex/fragment shaders are used
   * instead of `vertexShader`/`fragmentShader`. If both `preset` and `fragmentShader` are
   * provided, `preset` takes priority.
   */
  preset?: ShaderPresetName;
  /**
   * Preset-specific parameters. Each preset has its own set of configurable params with
   * sensible defaults. Any params not provided use the preset's defaults.
   * See `ShaderPresetName` for available presets and their parameters.
   */
  presetParams?: Record<string, unknown>;
  /**
   * Optional mask texture URL (PNG). When provided, the mask is loaded and injected
   * as `uMaskTexture` (sampler2D). The effect is multiplied by the selected channel's
   * intensity (0.0 = fully masked, 1.0 = fully visible).
   * The mask is sampled at the same UV coordinates as the layer texture.
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to use. Default: "r".
   * - "r": red channel
   * - "g": green channel
   * - "b": blue channel
   */
  maskChannel?: MaskChannel;
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
  /** Easing factor used during programmatic animations (marker focus & reset). Lower = slower/smoother. Default: 0.05 */
  focusEasingFactor?: number;
}

export interface ZoomConfig {
  enabled?: boolean;
  minZoom?: number;
  maxZoom?: number;
  initialZoom?: number;
  /** When true, camera starts at minZoom and animates to initialZoom after loading completes. Default: false */
  animateIntroZoom?: boolean;
  /** Delay in milliseconds after loading fade completes before intro zoom starts. Default: 0 */
  introZoomDelayMs?: number;
  scrollSpeed?: number;
  easingFactor?: number;
  /** Easing factor used during programmatic animations (marker focus & reset). Lower = slower/smoother. Default: 0.05 */
  focusEasingFactor?: number;
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

export interface PinnedSpriteConfig {
  /** Unique ID for this pinned sprite */
  id: string;
  /** URL to the sprite sheet PNG. Frames are auto-detected as a grid of square frames. */
  src: string;
  /** X position in base image pixel coordinates (0 = left edge) */
  x: number;
  /** Y position in base image pixel coordinates (0 = top edge) */
  y: number;
  /** Frames per second for sprite sheet animation. Default: 8 */
  fps?: number;
  /** zIndex for depth ordering (same system as MapLayer). Default: 10 */
  zIndex?: number;
  /**
   * Scale multiplier applied to the frame pixel size in world space.
   * displaySize = framePixelSize * scale.
   * Example: frame is 128 px, flag region is 72 px -> scale ~= 0.5625.
   * Default: 1
   */
  scale?: number;
  /** Opacity of the sprite (0-1). Default: 1 */
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
   * - 'glow': luminous particles using glow fragment shaders with optional pulse behavior.
   * Default: 'twinkle'
   */
  mode?: "twinkle" | "drift" | "glow";
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
  // --- Glow mode options ---
  /**
   * Glow visual sub-style (only used when mode is "glow"):
   * - 'soft': smooth radial gradient fading from center (firefly look).
   * - 'bloom': bright over-exposed core with a wide dim halo (magical orb look).
   * - 'pulse': glow that breathes in size and intensity over time.
   * - 'all': combines bloom visuals with pulse animation (default).
   */
  glowStyle?: "soft" | "bloom" | "pulse" | "all";
  /**
   * Glow movement behaviour (only used when mode is "glow"):
   * - 'stationary': particle glows in place, respawns at a new random position when its cycle ends.
   * - 'drift': particle slowly floats in a direction while glowing (reuses driftDirection/driftSpeed/driftDistance).
   * Default: 'stationary'
   */
  glowMovement?: "stationary" | "drift";
  /**
   * Duration of one glow cycle in seconds.
   * For 'pulse'/'all' styles this is the pulse period.
   * For 'soft'/'bloom' with stationary movement this is how long before respawn.
   * Default: 3
   */
  glowDuration?: number;
  /** Random duration variance factor (0-1). Default: 0.4 */
  glowDurationVariance?: number;
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
  /**
   * Optional mask texture URL (PNG). When provided, particles are constrained
   * to regions where the specified mask channel has a non-zero value.
   * The mask image is loaded into an offscreen canvas for CPU-side pixel sampling.
   * The mask coordinates map to the particle region (or full map if no region).
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to sample. Default: "r".
   */
  maskChannel?: MaskChannel;
  /**
   * How the mask constrains particles:
   * - "spawn": Particles only spawn where mask > 0, but can drift freely. (Default)
   * - "constrain": Particles are respawned if they move to where mask = 0.
   * - "both": Spawn within mask AND constrain movement to mask region.
   */
  maskBehavior?: "spawn" | "constrain" | "both";
  /**
   * Minimum mask channel value (0–1) to consider a pixel as "inside" the region.
   * Default: 0.1 (anything above ~25/255 is considered inside).
   */
  maskThreshold?: number;
}

export interface ShaderEffectConfig {
  /** Unique ID for this shader effect */
  id: string;
  /** GLSL fragment shader source. Required when `preset` is not set. */
  fragmentShader?: string;
  /** GLSL vertex shader source. If omitted, a default passthrough vertex shader is used. */
  vertexShader?: string;
  /**
   * Optional texture URL (PNG). If provided, the texture is loaded and injected as `uTexture` (sampler2D).
   * If omitted, `uTexture` is not available in the shader.
   */
  src?: string;
  /**
   * Coordinate space for the shader quad.
   * - 'map': world/map space (default). Quad uses base image coordinates and parallax.
   * - 'viewport': screen-following overlay space. Quad follows camera view and ignores map parallax.
   */
  space?: "map" | "viewport";
  /**
   * Optional rectangular region in base image pixel coordinates.
   * If omitted, the shader quad covers the entire base image (baseWidth x baseHeight).
   * Note: when `space` is "viewport", region is interpreted in viewport-local coordinates.
   */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /**
   * Additional custom uniforms to pass to the shader.
   * Values can be numbers, arrays (vec2/vec3/vec4), or Three.js objects (Color, Texture, etc.).
   * These are merged with the auto-injected uniforms. Custom values take precedence on collision.
   */
  uniforms?: Record<string, { value: unknown }>;
  /** Whether the material should use transparent blending. Default: true */
  transparent?: boolean;
  /** Whether to write to the depth buffer. Default: false */
  depthWrite?: boolean;
  /** zIndex for depth ordering (same system as MapLayer). Default: 12 */
  zIndex?: number;
  /**
   * Override the auto-calculated parallax factor for this shader effect.
   * Only used when parallaxConfig is provided on the map.
   * 1.0 = moves with camera. < 1 = slower (farther). > 1 = faster (closer).
   */
  parallaxFactor?: number;
  /**
   * Built-in shader preset name. When set, the preset's vertex/fragment shaders are used
   * instead of `vertexShader`/`fragmentShader`. If both `preset` and `fragmentShader` are
   * provided, `preset` takes priority.
   */
  preset?: ShaderPresetName;
  /**
   * Preset-specific parameters. Each preset has its own set of configurable params with
   * sensible defaults. Any params not provided use the preset's defaults.
   * See `ShaderPresetName` for available presets and their parameters.
   */
  presetParams?: Record<string, unknown>;
  /**
   * Optional mask texture URL (PNG). When provided, the mask is loaded and injected
   * as `uMaskTexture` (sampler2D). The effect is multiplied by the selected channel's
   * intensity (0.0 = fully masked, 1.0 = fully visible).
   * The mask is sampled at `vUv` (0-1 across the shader quad).
   */
  maskSrc?: string;
  /**
   * Which color channel of the mask texture to use. Default: "r".
   * - "r": red channel
   * - "g": green channel
   * - "b": blue channel
   */
  maskChannel?: MaskChannel;
}

/**
 * High-level config that maps RGB channels of a mask image to different effects.
 * Each channel (red, green, blue) can have a shader effect, particle effect, or be unused.
 * This is a convenience wrapper — internally it creates ShaderEffectConfig and ParticleEffectConfig
 * instances with the appropriate maskSrc/maskChannel settings.
 */
export interface MaskEffectConfig {
  /** Unique ID for this mask effect group */
  id: string;
  /** URL to the RGB mask image (PNG) */
  src: string;
  /**
   * Pin this mask effect group to a specific map layer by its ID.
   * When set, effects become children of the layer's mesh in the scene graph,
   * inheriting all transforms: parallax, pan, zoom scaling, carousel, and animations.
   * The mask image dimensions should match the pinned layer's image dimensions.
   *
   * When pinnedTo is set, these fields are ignored (inherited from the layer):
   * - space (always "map")
   * - parallaxFactor (inherited from layer)
   * - zIndex (rendered as child of the layer mesh)
   */
  pinnedTo?: string;
  /** Effect to apply on the red channel regions */
  red?: MaskChannelEffect;
  /** Effect to apply on the green channel regions */
  green?: MaskChannelEffect;
  /** Effect to apply on the blue channel regions */
  blue?: MaskChannelEffect;
  /**
   * Coordinate space for shader effects within this group.
   * - 'map': world/map space (default). Parallax-aware.
   * - 'viewport': screen-following overlay space.
   */
  space?: "map" | "viewport";
  /** zIndex for depth ordering. Shader effects get this zIndex, particles get zIndex + 0.001. Default: 12 */
  zIndex?: number;
  /** Override parallax factor for all effects in this group */
  parallaxFactor?: number;
  /** Whether the shader materials use transparent blending. Default: true */
  transparent?: boolean;
  /**
   * Particle mask behavior for all particle effects in this group.
   * Default: "both" (spawn + constrain).
   */
  maskBehavior?: "spawn" | "constrain" | "both";
  /** Minimum mask channel value threshold. Default: 0.1 */
  maskThreshold?: number;
}

/**
 * Internal config for a shader effect pinned to a layer.
 * Similar to ShaderEffectConfig but without positioning/parallax fields.
 * These are rendered as children of a MapLayerMesh.
 */
export interface PinnedShaderEffectConfig {
  /** Unique ID for this pinned shader effect */
  id: string;
  /** Built-in shader preset name */
  preset?: ShaderPresetName;
  /** Preset-specific parameters */
  presetParams?: Record<string, unknown>;
  /** Custom fragment shader (used when preset is not set) */
  fragmentShader?: string;
  /** Custom vertex shader */
  vertexShader?: string;
  /** Additional custom uniforms */
  uniforms?: Record<string, { value: unknown }>;
  /** Optional texture URL for the shader */
  src?: string;
  /** Mask texture URL */
  maskSrc?: string;
  /** Mask channel to sample */
  maskChannel?: MaskChannel;
  /** Whether the material uses transparent blending. Default: true */
  transparent?: boolean;
  /** Z-offset within the parent layer (0.001 increments). Default: 0.001 */
  localZOffset?: number;
}

/**
 * Internal config for a particle effect pinned to a layer.
 * Similar to ParticleEffectConfig but without positioning/parallax fields.
 * Particle positions are computed in layer-local coordinates.
 */
export interface PinnedParticleEffectConfig {
  /** Unique ID for this pinned particle effect */
  id: string;
  /** Visual mode. Default: "twinkle" */
  mode?: "twinkle" | "drift" | "glow";
  /** Maximum particle count. Default: 50 */
  maxCount?: number;
  /** Particle color (CSS string). Default: "#ffffff" */
  color?: string;
  /** Base particle size in pixels. Default: 3 */
  size?: number;
  /** Size variance factor (0-1). Default: 0.3 */
  sizeVariance?: number;
  /** Optional particle texture URL */
  src?: string;
  /** Twinkle duration in seconds. Default: 2 */
  twinkleDuration?: number;
  /** Twinkle duration variance (0-1). Default: 0.5 */
  twinkleDurationVariance?: number;
  /** Drift direction as normalized vector. Default: { x: 0, y: 1 } */
  driftDirection?: { x: number; y: number };
  /** Drift direction variance in degrees. Default: 15 */
  driftDirectionVariance?: number;
  /** Drift speed in px/s. Default: 30 */
  driftSpeed?: number;
  /** Drift speed variance (0-1). Default: 0.3 */
  driftSpeedVariance?: number;
  /** Drift distance in px. Default: 100 */
  driftDistance?: number;
  /** Glow visual sub-style. Default: "all" */
  glowStyle?: "soft" | "bloom" | "pulse" | "all";
  /** Glow movement behaviour. Default: "stationary" */
  glowMovement?: "stationary" | "drift";
  /** Glow cycle duration in seconds. Default: 3 */
  glowDuration?: number;
  /** Glow duration variance (0-1). Default: 0.4 */
  glowDurationVariance?: number;
  /** Base opacity (0-1). Default: 1 */
  opacity?: number;
  /** Mask texture URL */
  maskSrc?: string;
  /** Mask channel to sample */
  maskChannel?: MaskChannel;
  /** Mask behavior. Default: "both" */
  maskBehavior?: "spawn" | "constrain" | "both";
  /** Mask threshold. Default: 0.1 */
  maskThreshold?: number;
  /** Z-offset within the parent layer (0.001 increments). Default: 0.002 */
  localZOffset?: number;
}

/**
 * Collection of pinned effects to render as children of a map layer mesh.
 */
export interface PinnedEffects {
  shaderEffects: PinnedShaderEffectConfig[];
  particleEffects: PinnedParticleEffectConfig[];
}

export interface LoadingStyleConfig {
  barColor?: string;
  backgroundColor?: string;
  textColor?: string;
  barHeight?: number;
  font?: string;
}

export interface RenderConfig {
  /**
   * Device pixel ratio used by the Three.js renderer.
   * Use a capped tuple (e.g. [1, 1.5]) to reduce mobile GPU load.
   */
  dpr?: number | [number, number];
  /** Enables/disables MSAA on the WebGL context. Default: true */
  antialias?: boolean;
  /** Hint to browser GPU scheduling. Default: "default" */
  powerPreference?: "default" | "high-performance" | "low-power";
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
  /** Array of pinned sprite configurations (e.g. fixed-position animated flags). */
  pinnedSprites?: PinnedSpriteConfig[];
  /** Array of fog effect configurations */
  fogEffects?: FogEffectConfig[];
  /** Array of particle effect configurations (sparkles, embers, fairy dust, etc.) */
  particleEffects?: ParticleEffectConfig[];
  /** Array of standalone shader effect configurations */
  shaderEffects?: ShaderEffectConfig[];
  /** Array of mask effect configurations for region-based effects */
  maskEffects?: MaskEffectConfig[];
  /** Called when a marker is clicked. Receives the marker ID. */
  onMarkerClick?: (markerId: string) => void;
  /** Optional custom milestone messages shown in the loading overlay. */
  loadingMessages?: string[];
  /** Optional style overrides for the loading overlay. */
  loadingStyle?: LoadingStyleConfig;
  /** Controls loading screen visibility. Defaults to true. */
  showLoadingScreen?: boolean;
  /** Renderer tuning options for performance-sensitive environments (e.g. mobile). */
  renderConfig?: RenderConfig;
  /**
   * Scale factor (0-1) applied to markers when the map container width
   * is at or below `mobileBreakpoint`. For example, 0.6 shrinks markers
   * to 60% of their normal size. Default: 1 (no change).
   */
  mobileMarkerScale?: number;
  /**
   * Container width (px) below which `mobileMarkerScale` is applied.
   * Default: 768.
   */
  mobileBreakpoint?: number;
  /**
   * When false, particle initialization does not block the loading overlay.
   * Particles continue initializing in the background after first frame.
   * Default: true
   */
  blockOnParticleInit?: boolean;
  /**
   * Increment this number to reset viewport to initial load state
   * (initialZoom and centered pan). E.g. set to Date.now() or a counter.
   */
  resetZoomTrigger?: number;
}
