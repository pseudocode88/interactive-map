import type {
  MapLayer,
  MapMarker,
  MaskEffectConfig,
  ParticleEffectConfig,
  PinnedSpriteConfig,
  ShaderEffectConfig,
  SpriteEffectConfig,
} from "@interactive-map/core";
import type { BuiltMapConfig, DemoMapDefinition } from "./types";

const VIGNETTE_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  void main() {
    vec2 center = vUv - 0.5;
    float dist = length(center);
    float pulse = 0.85 + 0.15 * sin(uTime * 0.5);
    float vignette = smoothstep(0.5 * pulse, 0.9, dist);
    gl_FragColor = vec4(0.0, 0.0, 0.0, vignette * 0.4);
  }
`;

const BASE_MARKERS: MapMarker[] = [
  { id: "castle", x: 900, y: 1280, label: "Castle", color: "#FFC857" },
  { id: "village", x: 1900, y: 1040, label: "Village", color: "#FFC857" },
  { id: "harbor", x: 3000, y: 1260, label: "Harbor Gate", color: "#FFC857" },
  { id: "forest", x: 2250, y: 520, label: "Dark Forest", color: "#FFC857" },
];

const MOBILE_ASSET_SCALE = 0.5;

function getBaseSource(isMobile: boolean): string {
  return isMobile ? "/base-map-mobile.webp" : "/base-map.webp";
}

function getMaskSource(isMobile: boolean): string {
  return isMobile ? "/maps/demo-mask-mobile.png" : "/maps/demo-mask.png";
}

function buildMarkers(isMobile: boolean): MapMarker[] {
  if (!isMobile) {
    return BASE_MARKERS;
  }

  return BASE_MARKERS.map((marker) => ({
    ...marker,
    x: marker.x * MOBILE_ASSET_SCALE,
    y: marker.y * MOBILE_ASSET_SCALE,
  }));
}

function buildLayers(isMobile: boolean): MapLayer[] {

  const cloudBackStatic = {
      id: "cloud-back",
      src: "/overlay-cloud-back.webp",
      zIndex: -1,
    };

  const baseLayer: MapLayer = {
    id: "base",
    src: getBaseSource(isMobile),
    zIndex: 0,
  };
  const cloudFrontLayer: MapLayer = {
    id: "cloud-front",
    src: isMobile ? "/overlay-mobile.webp" : "/overlay.webp",
    zIndex: 1,
    animation: [{ type: "fade", minOpacity: 0.4, maxOpacity: 0.6, duration: 6 }],
  };
  const cloudSlideLayer: MapLayer = {
    id: "cloud-slide-front",
    src: isMobile ? "/cloud-slide-front-mobile.webp" : "/cloud-slide-front.webp",
    zIndex: 4,
    animation: [
      {
        type: "carousel",
        direction: { x: -1, y: 0 },
        speed: isMobile ? 26 : 30,
      },
      { type: "fade", minOpacity: 0.8, maxOpacity: 1, duration: 5 },
    ],
  };

  if (isMobile) {
    return [cloudBackStatic, baseLayer, cloudFrontLayer, cloudSlideLayer];
  }

  return [
    cloudBackStatic,
    baseLayer,
    cloudFrontLayer,
    cloudSlideLayer,
    {
      id: "cloud-slide-front-2",
      src: "/cloud-slide-front-2.webp",
      zIndex: 5,
      animation: [
        {
          type: "carousel",
          direction: { x: -1, y: 0 },
          speed: 10,
        },
        { type: "fade", minOpacity: 0.8, maxOpacity: 1, duration: 3 },
      ],
    },
  ];
}

function buildSpriteEffects(isMobile: boolean, effectsEnabled: boolean): SpriteEffectConfig[] {
  if (!effectsEnabled) {
    return [];
  }

  return [
    {
      id: "birds",
      src: "/bird.png",
      maxCount: isMobile ? 2 : 4,
      speed: isMobile ? 80 : 100,
      speedVariance: 0.3,
      direction: { x: 1, y: -0.1 },
      directionVariance: 20,
      oscillation: { amplitude: isMobile ? 8 : 12, frequency: 0.6 },
      fps: 8,
      zIndex: 8,
      scale: isMobile ? 0.9 : 1,
    },
  ];
}

function buildPinnedSprites(
  isMobile: boolean,
  effectsEnabled: boolean
): PinnedSpriteConfig[] {
  if (!effectsEnabled) {
    return [];
  }

  const mobileScale = isMobile ? 0.5 : 1;

  return [
    {
      id: "flag",
      src: "/flag.png",
      x: isMobile ? 900 * MOBILE_ASSET_SCALE : 900,
      y: isMobile ? 1280 * MOBILE_ASSET_SCALE : 1280,
      fps: 8,
      zIndex: 2,
      scale: 0.5625 * mobileScale,
      opacity: 1,
    },
  ];
}

function buildParticleEffects(
  isMobile: boolean,
  effectsEnabled: boolean
): ParticleEffectConfig[] {
  if (!effectsEnabled) {
    return [];
  }

  return [
    {
      id: "embers",
      mode: "drift",
      maxCount: isMobile ? 16 : 40,
      color: "#fff",
      size: isMobile ? 5 : 7,
      sizeVariance: 0.4,
      driftDirection: { x: 0.1, y: 1 },
      driftDirectionVariance: 20,
      driftSpeed: isMobile ? 18 : 25,
      driftSpeedVariance: 0.3,
      driftDistance: isMobile ? 90 : 120,
      regionMode: "container",
      zIndex: 11,
      opacity: 0.8,
    },
  ];
}

function buildMaskEffects(isMobile: boolean, effectsEnabled: boolean): MaskEffectConfig[] {
  if (!effectsEnabled) {
    return [];
  }

  const maskSrc = getMaskSource(isMobile);

  return [
    {
      id: "terrain-effects",
      src: maskSrc,
      pinnedTo: "base",
      red: {
        type: "particles",
        config: {
          mode: "twinkle",
          maxCount: isMobile ? 60 : 200,
          color: "#d3ebfe",
          size: isMobile ? 4 : 5,
          twinkleDuration: 2,
          twinkleDurationVariance: 0.8,
        },
      },
      blue: {
        type: "particles",
        config: {
          mode: "drift",
          maxCount: isMobile ? 24 : 80,
          color: "#FFD700",
          size: 3,
          sizeVariance: 0.4,
          driftDirection: { x: 0.1, y: 1 },
          driftDirectionVariance: 20,
          driftSpeed: isMobile ? 18 : 25,
          driftSpeedVariance: 0.3,
          driftDistance: isMobile ? 80 : 120,
        },
      },
      green: isMobile
        ? undefined
        : {
            type: "particles",
            config: {
              mode: "glow",
              glowStyle: "pulse",
              glowMovement: "stationary",
              maxCount: 100,
              color: "#83ff72",
              size: 10,
              sizeVariance: 0.3,
              glowDuration: 3,
              glowDurationVariance: 0.5,
              regionMode: "container",
              zIndex: 11,
              opacity: 0.8,
            },
          },
      zIndex: 1.5,
      space: "map",
      maskBehavior: "both",
    },
  ];
}

function buildShaderEffects(isMobile: boolean, effectsEnabled: boolean): ShaderEffectConfig[] {
  if (!effectsEnabled || isMobile) {
    return [];
  }

  return [
    {
      id: "vignette",
      space: "viewport",
      fragmentShader: VIGNETTE_FRAGMENT_SHADER,
      zIndex: 10,
    },
  ];
}

function buildOlympusConfig(isMobile: boolean, effectsEnabled: boolean): BuiltMapConfig {
  return {
    markers: buildMarkers(isMobile),
    loadingMessages: [
      "Unrolling the map...",
      "Painting the terrain...",
      "Summoning creatures...",
      "Lighting the torches...",
      "Adventure awaits...",
    ],
    loadingStyle: {
      barColor: "#c8a860",
      backgroundColor: "rgba(10, 8, 5, 0.9)",
      textColor: "#d4c5a0",
    },
    renderConfig: isMobile
      ? { dpr: [1, 1.25], antialias: false, powerPreference: "low-power" }
      : { dpr: [1, 2], antialias: true, powerPreference: "high-performance" },
    blockOnParticleInit: !isMobile,
    baseLayerId: "base",
    panConfig: { enabled: true, easingFactor: 0.15 },
    zoomConfig: {
      enabled: true,
      minZoom: 1,
      maxZoom: isMobile ? 1.4 : 1.6,
      initialZoom: isMobile ? 1.05 : 1.1,
      animateIntroZoom: !isMobile,
      introZoomDelayMs: 1000,
    },
    parallaxConfig: { intensity: isMobile ? 0.2 : 0.3, mode: "depth" },
    layers: buildLayers(isMobile),
    spriteEffects: buildSpriteEffects(isMobile, effectsEnabled),
    pinnedSprites: buildPinnedSprites(isMobile, effectsEnabled),
    fogEffects: [],
    particleEffects: buildParticleEffects(isMobile, effectsEnabled),
    shaderEffects: buildShaderEffects(isMobile, effectsEnabled),
    maskEffects: buildMaskEffects(isMobile, effectsEnabled),
  };
}

export const olympusMapDefinition: DemoMapDefinition = {
  id: "olympus",
  label: "Olympus",
  buildConfig: ({ isMobile, effectsEnabled }) => buildOlympusConfig(isMobile, effectsEnabled),
};
