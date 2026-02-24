import type {
  InteractiveMapProps,
  MapMarker,
  RenderConfig,
  ZoomConfig,
  ParallaxConfig,
  PanConfig,
  LoadingStyleConfig,
} from "@interactive-map/core";

export interface MapBuildContext {
  isMobile: boolean;
  effectsEnabled: boolean;
}

export interface BuiltMapConfig {
  markers: MapMarker[];
  loadingMessages: string[];
  loadingStyle: LoadingStyleConfig;
  renderConfig: RenderConfig;
  blockOnParticleInit: boolean;
  baseLayerId: string;
  panConfig: PanConfig;
  zoomConfig: ZoomConfig;
  parallaxConfig: ParallaxConfig;
  layers: NonNullable<InteractiveMapProps["layers"]>;
  spriteEffects: NonNullable<InteractiveMapProps["spriteEffects"]>;
  pinnedSprites: NonNullable<InteractiveMapProps["pinnedSprites"]>;
  fogEffects: NonNullable<InteractiveMapProps["fogEffects"]>;
  particleEffects: NonNullable<InteractiveMapProps["particleEffects"]>;
  shaderEffects: NonNullable<InteractiveMapProps["shaderEffects"]>;
  maskEffects: NonNullable<InteractiveMapProps["maskEffects"]>;
}

export interface DemoMapDefinition {
  id: string;
  label: string;
  buildConfig: (context: MapBuildContext) => BuiltMapConfig;
}
