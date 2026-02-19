export { InteractiveMap } from "./components/InteractiveMap";
export {
  DEFAULT_LAYER_VERTEX_SHADER,
  buildMaskUniforms,
  buildStandaloneShaderUniforms,
  prependMaskDefine,
} from "./utils/shaderDefaults";
export { useMaskTexture } from "./hooks/useMaskTexture";
export { resolveShaderPreset } from "./utils/shaderPresets";
export type { ResolvedPreset } from "./utils/shaderPresets";
export type {
  BounceAnimation,
  CarouselAnimation,
  EasingConfig,
  EasingPreset,
  FadeAnimation,
  FogEffectConfig,
  FogOpacityPulse,
  FogScaleBreathing,
  InteractiveMapProps,
  LayerAnimation,
  LayerShaderConfig,
  MaskChannel,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  ParallaxConfig,
  PanConfig,
  ShaderEffectConfig,
  ShaderPresetName,
  SpriteEffectConfig,
  WobbleAnimation,
  ZoomConfig,
} from "./types";
