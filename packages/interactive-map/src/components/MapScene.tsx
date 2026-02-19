import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  LoadingStage,
} from "../context/LoadingManagerContext";
import { useLoadingManager } from "../hooks/useLoadingManager";
import type {
  FogEffectConfig,
  MapLayer,
  MapMarker,
  MaskEffectConfig,
  ParticleEffectConfig,
  PinnedEffects,
  PanConfig,
  ParallaxConfig,
  ShaderEffectConfig,
  SpriteEffectConfig,
  ZoomConfig,
} from "../types";
import { resolveAllMaskEffects } from "../utils/maskEffectResolver";
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
  maskEffects?: MaskEffectConfig[];
  onMarkerClick?: (markerId: string) => void;
  onMarkerHoverChange?: (markerId: string | null) => void;
  focusTarget?: { x: number; y: number } | null;
  onFocusComplete?: () => void;
  onFocusInterrupted?: () => void;
  resetZoomTrigger?: number;
  introZoomTrigger?: number;
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
}

function countOperationIdsByLayer(mapByLayer: Record<string, Record<string, string>>): number {
  return Object.values(mapByLayer).reduce((count, item) => count + Object.keys(item).length, 0);
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
  maskEffects,
  onMarkerClick,
  onMarkerHoverChange,
  focusTarget,
  onFocusComplete,
  onFocusInterrupted,
  resetZoomTrigger,
  introZoomTrigger,
  onViewportChange,
}: MapSceneProps) {
  const { registerStage, updateStageProgress, completeStage } = useLoadingManager();
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
  const resolvedMaskEffects = useMemo<ReturnType<typeof resolveAllMaskEffects>>(() => {
    if (!maskEffects || maskEffects.length === 0) {
      return {
        shaderEffects: [],
        particleEffects: [],
        pinnedEffects: new Map<string, PinnedEffects>(),
      };
    }
    return resolveAllMaskEffects(maskEffects);
  }, [maskEffects]);
  const allShaderEffects = useMemo(
    () => [...(shaderEffects ?? []), ...resolvedMaskEffects.shaderEffects],
    [shaderEffects, resolvedMaskEffects.shaderEffects]
  );
  const allParticleEffects = useMemo(
    () => [...(particleEffects ?? []), ...resolvedMaskEffects.particleEffects],
    [particleEffects, resolvedMaskEffects.particleEffects]
  );

  const layerMaskTextureOperationIds = useMemo(
    () =>
      Object.fromEntries(
        sortedLayers
          .filter((layer) => !!layer.shaderConfig?.maskSrc)
          .map((layer) => [layer.id, `layer-mask:${layer.id}`])
      ),
    [sortedLayers]
  );
  const shaderMaskTextureOperationIds = useMemo(
    () =>
      Object.fromEntries(
        allShaderEffects
          .filter((effect) => !!effect.maskSrc)
          .map((effect) => [effect.id, `shader-mask:${effect.id}`])
      ),
    [allShaderEffects]
  );
  const particleMaskSamplerOperationIds = useMemo(
    () =>
      Object.fromEntries(
        allParticleEffects
          .filter((effect) => !!effect.maskSrc)
          .map((effect) => [effect.id, `particle-mask:${effect.id}`])
      ),
    [allParticleEffects]
  );
  const pinnedShaderMaskTextureOperationIdsByLayer = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};

    for (const layer of sortedLayers) {
      const layerPinnedEffects = resolvedMaskEffects.pinnedEffects.get(layer.id);
      if (!layerPinnedEffects) {
        continue;
      }

      const layerResult = Object.fromEntries(
        layerPinnedEffects.shaderEffects
          .filter((effect) => !!effect.maskSrc)
          .map((effect) => [effect.id, `pinned-shader-mask:${layer.id}:${effect.id}`])
      );

      if (Object.keys(layerResult).length > 0) {
        result[layer.id] = layerResult;
      }
    }

    return result;
  }, [resolvedMaskEffects.pinnedEffects, sortedLayers]);
  const pinnedParticleMaskSamplerOperationIdsByLayer = useMemo(() => {
    const result: Record<string, Record<string, string>> = {};

    for (const layer of sortedLayers) {
      const layerPinnedEffects = resolvedMaskEffects.pinnedEffects.get(layer.id);
      if (!layerPinnedEffects) {
        continue;
      }

      const layerResult = Object.fromEntries(
        layerPinnedEffects.particleEffects
          .filter((effect) => !!effect.maskSrc)
          .map((effect) => [effect.id, `pinned-particle-mask:${layer.id}:${effect.id}`])
      );

      if (Object.keys(layerResult).length > 0) {
        result[layer.id] = layerResult;
      }
    }

    return result;
  }, [resolvedMaskEffects.pinnedEffects, sortedLayers]);

  const totalLayerCount = sortedLayers.length;
  const totalParticleCount = allParticleEffects.length;
  const totalMaskOperationCount =
    Object.keys(layerMaskTextureOperationIds).length +
    Object.keys(shaderMaskTextureOperationIds).length +
    Object.keys(particleMaskSamplerOperationIds).length +
    countOperationIdsByLayer(pinnedShaderMaskTextureOperationIdsByLayer) +
    countOperationIdsByLayer(pinnedParticleMaskSamplerOperationIdsByLayer);

  const loadedLayerIdsRef = useRef(new Set<string>());
  const loadedMaskOperationIdsRef = useRef(new Set<string>());
  const loadedParticleIdsRef = useRef(new Set<string>());

  useEffect(() => {
    loadedLayerIdsRef.current.clear();
    registerStage(LoadingStage.LAYER_TEXTURES, "Loading map layers");

    if (totalLayerCount === 0) {
      completeStage(LoadingStage.LAYER_TEXTURES);
      return;
    }

    updateStageProgress(LoadingStage.LAYER_TEXTURES, 0);
  }, [completeStage, registerStage, totalLayerCount, updateStageProgress]);

  useEffect(() => {
    loadedMaskOperationIdsRef.current.clear();
    registerStage(LoadingStage.MASK_TEXTURES, "Applying masks");

    if (totalMaskOperationCount === 0) {
      completeStage(LoadingStage.MASK_TEXTURES);
      return;
    }

    updateStageProgress(LoadingStage.MASK_TEXTURES, 0);
  }, [completeStage, registerStage, totalMaskOperationCount, updateStageProgress]);

  useEffect(() => {
    loadedParticleIdsRef.current.clear();
    registerStage(LoadingStage.PARTICLE_INIT, "Initializing particles");

    if (totalParticleCount === 0) {
      completeStage(LoadingStage.PARTICLE_INIT);
      return;
    }

    updateStageProgress(LoadingStage.PARTICLE_INIT, 0);
  }, [completeStage, registerStage, totalParticleCount, updateStageProgress]);

  useEffect(() => {
    registerStage(LoadingStage.FIRST_FRAME, "Rendering first frame");
    updateStageProgress(LoadingStage.FIRST_FRAME, 0);
  }, [registerStage, updateStageProgress]);

  const handleLayerTextureLoaded = useCallback(
    (layerId: string) => {
      if (loadedLayerIdsRef.current.has(layerId)) {
        return;
      }

      loadedLayerIdsRef.current.add(layerId);
      const nextProgress = loadedLayerIdsRef.current.size / Math.max(1, totalLayerCount);
      updateStageProgress(LoadingStage.LAYER_TEXTURES, nextProgress);

      if (loadedLayerIdsRef.current.size >= totalLayerCount) {
        completeStage(LoadingStage.LAYER_TEXTURES);
      }
    },
    [completeStage, totalLayerCount, updateStageProgress]
  );

  const handleMaskOperationLoaded = useCallback(
    (operationId: string) => {
      if (!operationId || loadedMaskOperationIdsRef.current.has(operationId)) {
        return;
      }

      loadedMaskOperationIdsRef.current.add(operationId);
      const nextProgress =
        loadedMaskOperationIdsRef.current.size / Math.max(1, totalMaskOperationCount);
      updateStageProgress(LoadingStage.MASK_TEXTURES, nextProgress);

      if (loadedMaskOperationIdsRef.current.size >= totalMaskOperationCount) {
        completeStage(LoadingStage.MASK_TEXTURES);
      }
    },
    [completeStage, totalMaskOperationCount, updateStageProgress]
  );

  const handleParticleReady = useCallback(
    (particleId: string) => {
      if (loadedParticleIdsRef.current.has(particleId)) {
        return;
      }

      loadedParticleIdsRef.current.add(particleId);
      const nextProgress = loadedParticleIdsRef.current.size / Math.max(1, totalParticleCount);
      updateStageProgress(LoadingStage.PARTICLE_INIT, nextProgress);

      if (loadedParticleIdsRef.current.size >= totalParticleCount) {
        completeStage(LoadingStage.PARTICLE_INIT);
      }
    },
    [completeStage, totalParticleCount, updateStageProgress]
  );

  const firstFrameReportedRef = useRef(false);
  useFrame(() => {
    if (firstFrameReportedRef.current) {
      return;
    }

    firstFrameReportedRef.current = true;
    completeStage(LoadingStage.FIRST_FRAME);
  });

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
        introZoomTrigger={introZoomTrigger}
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
        const layerPinnedEffects = resolvedMaskEffects.pinnedEffects.get(layer.id);

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
            pinnedEffects={layerPinnedEffects}
            onTextureLoaded={() => handleLayerTextureLoaded(layer.id)}
            onMaskOperationLoaded={handleMaskOperationLoaded}
            layerMaskTextureOperationId={layerMaskTextureOperationIds[layer.id]}
            pinnedShaderMaskTextureOperationIds={
              pinnedShaderMaskTextureOperationIdsByLayer[layer.id]
            }
            pinnedParticleMaskSamplerOperationIds={
              pinnedParticleMaskSamplerOperationIdsByLayer[layer.id]
            }
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
      {allParticleEffects.map((particle) => {
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
            onParticleReady={() => handleParticleReady(particle.id)}
            onMaskSamplerLoaded={handleMaskOperationLoaded}
            maskSamplerOperationId={particleMaskSamplerOperationIds[particle.id]}
          />
        );
      })}
      {allShaderEffects.map((effect) => {
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
            baseFrustumHalfWidth={baseFrustumHalfWidth}
            baseFrustumHalfHeight={baseFrustumHalfHeight}
            parallaxFactor={parallaxFactor}
            parallaxMode={parallaxConfig?.mode}
            viewportRef={viewportRef}
            onMaskTextureLoaded={handleMaskOperationLoaded}
            maskTextureOperationId={shaderMaskTextureOperationIds[effect.id]}
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
