import type { RefObject } from "react";
import { useCallback, useMemo } from "react";
import type {
  FogEffectConfig,
  MapLayer,
  MapMarker,
  ParticleEffectConfig,
  PanConfig,
  ParallaxConfig,
  ShaderEffectConfig,
  SpriteEffectConfig,
  ZoomConfig,
} from "../types";
import { computeParallaxFactor } from "../utils/parallax";
import { CameraController } from "./CameraController";
import { FogEffect } from "./FogEffect";
import { MapLayerMesh } from "./MapLayerMesh";
import { MarkerDot } from "./MarkerDot";
import { ParticleEffect } from "./ParticleEffect";
import { ShaderEffect } from "./ShaderEffect";
import { SpriteEffect } from "./SpriteEffect";

interface MapSceneProps {
  layers: MapLayer[];
  baseWidth: number;
  baseHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
  baseLayerId: string;
  baseLayerZIndex: number;
  panConfig: Required<PanConfig>;
  zoomConfig: Required<ZoomConfig>;
  parallaxConfig?: Required<ParallaxConfig>;
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  markers?: MapMarker[];
  spriteEffects?: SpriteEffectConfig[];
  fogEffects?: FogEffectConfig[];
  particleEffects?: ParticleEffectConfig[];
  shaderEffects?: ShaderEffectConfig[];
  onMarkerClick?: (markerId: string) => void;
  onMarkerHoverChange?: (markerId: string | null) => void;
  focusTarget?: { x: number; y: number } | null;
  onFocusComplete?: () => void;
  onFocusInterrupted?: () => void;
  resetZoomTrigger?: number;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
}

export function MapScene({
  layers,
  baseWidth,
  baseHeight,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  baseLayerId,
  baseLayerZIndex,
  panConfig,
  zoomConfig,
  parallaxConfig,
  viewportRef,
  markers,
  spriteEffects,
  fogEffects,
  particleEffects,
  shaderEffects,
  onMarkerClick,
  onMarkerHoverChange,
  focusTarget,
  onFocusComplete,
  onFocusInterrupted,
  resetZoomTrigger,
  onViewportChange,
}: MapSceneProps) {
  const stableHoverChange = useCallback(
    (markerId: string | null) => onMarkerHoverChange?.(markerId),
    [onMarkerHoverChange]
  );
  const sortedLayers = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers]);
  const markerZPosition = useMemo(() => {
    if (layers.length === 0) {
      return 0.01;
    }

    const maxLayerZIndex = Math.max(...layers.map((layer) => layer.zIndex));
    return maxLayerZIndex * 0.01 + 0.01;
  }, [layers]);

  return (
    <>
      <CameraController
        baseWidth={baseWidth}
        baseHeight={baseHeight}
        panConfig={panConfig}
        zoomConfig={zoomConfig}
        focusTarget={focusTarget}
        onFocusComplete={onFocusComplete}
        onFocusInterrupted={onFocusInterrupted}
        resetZoomTrigger={resetZoomTrigger}
        onViewportChange={(viewport) => onViewportChange?.(viewport)}
      />
      {sortedLayers.map((layer) => {
        const animation = layer.animation
          ? Array.isArray(layer.animation)
            ? layer.animation
            : [layer.animation]
          : undefined;
        const isBaseLayer = layer.id === baseLayerId;
        const parallaxFactor =
          !parallaxConfig || isBaseLayer
            ? 1
            : computeParallaxFactor(
                layer,
                baseLayerZIndex,
                parallaxConfig.intensity
              );

        return (
          <MapLayerMesh
            key={layer.id}
            src={layer.src}
            zIndex={layer.zIndex}
            position={layer.position}
            animation={animation}
            shaderConfig={layer.shaderConfig}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            baseFrustumHalfWidth={baseFrustumHalfWidth}
            baseFrustumHalfHeight={baseFrustumHalfHeight}
            minZoom={zoomConfig.minZoom}
            maxZoom={zoomConfig.maxZoom}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
          />
        );
      })}
      {(fogEffects ?? []).map((fog) => {
        const parallaxFactor =
          !parallaxConfig || fog.parallaxFactor !== undefined
            ? (fog.parallaxFactor ?? 1)
            : computeParallaxFactor(
                {
                  id: fog.id,
                  src: fog.src,
                  zIndex: fog.zIndex ?? 9,
                  parallaxFactor: fog.parallaxFactor,
                },
                baseLayerZIndex,
                parallaxConfig.intensity
              );

        return (
          <FogEffect
            key={fog.id}
            config={fog}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
          />
        );
      })}
      {(particleEffects ?? []).map((particle) => {
        const attachedLayer = particle.layerId
          ? layers.find((layer) => layer.id === particle.layerId)
          : undefined;
        const layerOffset = attachedLayer
          ? {
              x: attachedLayer.position?.x ?? 0,
              y: attachedLayer.position?.y ?? 0,
            }
          : { x: 0, y: 0 };

        let parallaxFactor: number;
        if (attachedLayer && parallaxConfig) {
          const isBaseLayer = attachedLayer.id === baseLayerId;
          parallaxFactor = isBaseLayer
            ? 1
            : computeParallaxFactor(
                attachedLayer,
                baseLayerZIndex,
                parallaxConfig.intensity
              );
        } else if (!parallaxConfig || particle.parallaxFactor !== undefined) {
          parallaxFactor = particle.parallaxFactor ?? 1;
        } else {
          parallaxFactor = computeParallaxFactor(
            {
              id: particle.id,
              src: "",
              zIndex: particle.zIndex ?? 11,
              parallaxFactor: particle.parallaxFactor,
            },
            baseLayerZIndex,
            parallaxConfig.intensity
          );
        }

        return (
          <ParticleEffect
            key={particle.id}
            config={particle}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            baseFrustumHalfWidth={baseFrustumHalfWidth}
            baseFrustumHalfHeight={baseFrustumHalfHeight}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
            layerOffset={layerOffset}
          />
        );
      })}
      {(shaderEffects ?? []).map((effect) => {
        const parallaxFactor =
          !parallaxConfig || effect.parallaxFactor !== undefined
            ? (effect.parallaxFactor ?? 1)
            : computeParallaxFactor(
                {
                  id: effect.id,
                  src: effect.src ?? "",
                  zIndex: effect.zIndex ?? 12,
                  parallaxFactor: effect.parallaxFactor,
                },
                baseLayerZIndex,
                parallaxConfig.intensity
              );

        return (
          <ShaderEffect
            key={effect.id}
            config={effect}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
          />
        );
      })}
      {(spriteEffects ?? []).map((effect) => {
        const parallaxFactor =
          !parallaxConfig || effect.parallaxFactor !== undefined
            ? (effect.parallaxFactor ?? 1)
            : computeParallaxFactor(
                {
                  id: effect.id,
                  src: effect.src,
                  zIndex: effect.zIndex ?? 10,
                  parallaxFactor: effect.parallaxFactor,
                },
                baseLayerZIndex,
                parallaxConfig.intensity
              );

        return (
          <SpriteEffect
            key={effect.id}
            config={effect}
            baseWidth={baseWidth}
            baseHeight={baseHeight}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
          />
        );
      })}
      {(markers ?? []).map((marker) => {
        const worldX = marker.x - baseWidth / 2;
        const worldY = baseHeight / 2 - marker.y;

        return (
          <MarkerDot
            key={marker.id}
            marker={marker}
            worldX={worldX}
            worldY={worldY}
            zPosition={markerZPosition}
            onHoverChange={stableHoverChange}
            onClick={() => onMarkerClick?.(marker.id)}
          />
        );
      })}
    </>
  );
}
