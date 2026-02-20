import type { MapLayer, ParallaxConfig } from "../types";

export function computeParallaxFactor(
  layer: MapLayer,
  baseLayerZIndex: number,
  intensity: number
): number {
  if (layer.zIndex === baseLayerZIndex) {
    return 1;
  }

  if (layer.parallaxFactor !== undefined) {
    return layer.parallaxFactor;
  }

  return 1 + (layer.zIndex - baseLayerZIndex) * intensity;
}

export function computeParallaxScale(
  parallaxFactor: number,
  mode: ParallaxConfig["mode"] | undefined
): number {
  if (mode === "drift") {
    return 1;
  }

  return parallaxFactor;
}

export function computeAutoScaleFactor(
  parallaxFactor: number,
  maxZoom: number,
  minZoom: number,
  mode: ParallaxConfig["mode"] | undefined,
  baseWidth: number,
  baseHeight: number,
  layerWidth: number,
  layerHeight: number,
  baseFrustumHalfWidth: number,
  baseFrustumHalfHeight: number
): number {
  if (parallaxFactor === 1) {
    return 1;
  }

  const computeRequiredScaleAtZoom = (zoom: number): number => {
    const safeZoom = Math.max(zoom, 0.001);
    const visibleHalfWidth = baseFrustumHalfWidth / safeZoom;
    const visibleHalfHeight = baseFrustumHalfHeight / safeZoom;
    const maxPanRangeX = Math.max(0, baseWidth / 2 - visibleHalfWidth);
    const maxPanRangeY = Math.max(0, baseHeight / 2 - visibleHalfHeight);
    const panOffsetX = maxPanRangeX * Math.abs(parallaxFactor - 1);
    const panOffsetY = maxPanRangeY * Math.abs(parallaxFactor - 1);

    const depthScale =
      mode === "depth" ? Math.max(0.001, 1 + (safeZoom - 1) * parallaxFactor) : 1;
    const visibleWidthForLayer = (visibleHalfWidth * 2) / depthScale;
    const visibleHeightForLayer = (visibleHalfHeight * 2) / depthScale;
    const requiredWidth = visibleWidthForLayer + panOffsetX * 2;
    const requiredHeight = visibleHeightForLayer + panOffsetY * 2;

    return Math.max(1, requiredWidth / layerWidth, requiredHeight / layerHeight);
  };

  const requiredAtMinZoom = computeRequiredScaleAtZoom(minZoom);
  const requiredAtMaxZoom = computeRequiredScaleAtZoom(maxZoom);

  return Math.max(requiredAtMinZoom, requiredAtMaxZoom);
}
