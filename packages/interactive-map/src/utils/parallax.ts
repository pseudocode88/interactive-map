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

  const extremeZoom = Math.max(maxZoom, minZoom, 1);
  const visibleHalfWidth = baseFrustumHalfWidth / extremeZoom;
  const visibleHalfHeight = baseFrustumHalfHeight / extremeZoom;
  const maxPanRangeX = Math.max(0, baseWidth / 2 - visibleHalfWidth);
  const maxPanRangeY = Math.max(0, baseHeight / 2 - visibleHalfHeight);
  const panOffsetX = maxPanRangeX * Math.abs(parallaxFactor - 1);
  const panOffsetY = maxPanRangeY * Math.abs(parallaxFactor - 1);

  const depthScale =
    mode === "depth" ? Math.max(0.001, 1 + (extremeZoom - 1) * parallaxFactor) : 1;
  const visibleWidthForLayer = (visibleHalfWidth * 2) / depthScale;
  const visibleHeightForLayer = (visibleHalfHeight * 2) / depthScale;
  const requiredWidth = visibleWidthForLayer + panOffsetX * 2;
  const requiredHeight = visibleHeightForLayer + panOffsetY * 2;

  return Math.max(1, requiredWidth / layerWidth, requiredHeight / layerHeight);
}
