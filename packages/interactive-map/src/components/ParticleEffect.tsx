import { useFrame } from "@react-three/fiber";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  LinearFilter,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";
import type { ParticleEffectConfig } from "../types";
import { useMaskSampler } from "../hooks/useMaskSampler";
import { computeParallaxScale } from "../utils/parallax";
import {
  PARTICLE_FRAGMENT_SHADER_CIRCLE,
  PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM,
  PARTICLE_FRAGMENT_SHADER_GLOW_PULSE,
  PARTICLE_FRAGMENT_SHADER_GLOW_SOFT,
  PARTICLE_FRAGMENT_SHADER_TEXTURE,
  PARTICLE_VERTEX_SHADER,
} from "../utils/particleShaders";
import {
  createMaskedParticle,
  initializeMaskedParticles,
  initializeParticles,
  updateGlowParticle,
  updateMaskedDriftParticle,
  updateMaskedGlowParticle,
  updateMaskedTwinkleParticle,
  updateDriftParticle,
  updateTwinkleParticle,
  type ParticleInstance,
} from "../utils/particles";

interface ParticleEffectProps {
  config: ParticleEffectConfig;
  baseWidth: number;
  baseHeight: number;
  baseFrustumHalfWidth: number;
  baseFrustumHalfHeight: number;
  parallaxFactor: number;
  parallaxMode?: "depth" | "drift";
  viewportRef: RefObject<{ x: number; y: number; zoom: number }>;
  /** Offset from the attached layer's position (0,0 if no layer attachment) */
  layerOffset: { x: number; y: number };
}

interface ParticleRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampDimension(value: number): number {
  return Math.max(1, value);
}

function wrapCoordinate(value: number, size: number): number {
  if (size <= 0) {
    return 0;
  }

  return ((value % size) + size) % size;
}

function selectGlowFragmentShader(glowStyle: string): string {
  switch (glowStyle) {
    case "soft":
      return PARTICLE_FRAGMENT_SHADER_GLOW_SOFT;
    case "bloom":
      return PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM;
    case "pulse":
      return PARTICLE_FRAGMENT_SHADER_GLOW_PULSE;
    case "all":
    default:
      return PARTICLE_FRAGMENT_SHADER_GLOW_BLOOM;
  }
}

function resolveParticleRegion(
  config: ParticleEffectConfig,
  viewport: { x: number; y: number; zoom: number },
  baseWidth: number,
  baseHeight: number,
  baseFrustumHalfWidth: number,
  baseFrustumHalfHeight: number,
  layerOffset: { x: number; y: number }
): ParticleRegion {
  if (config.regionMode === "container") {
    const zoom = Math.max(0.001, viewport.zoom);
    const visibleWidth = clampDimension((baseFrustumHalfWidth * 2) / zoom);
    const visibleHeight = clampDimension((baseFrustumHalfHeight * 2) / zoom);

    const leftWorld = viewport.x - visibleWidth / 2;
    const topWorld = viewport.y + visibleHeight / 2;

    return {
      x: leftWorld + baseWidth / 2 - layerOffset.x,
      y: baseHeight / 2 + layerOffset.y - topWorld,
      width: visibleWidth,
      height: visibleHeight,
    };
  }

  if (config.region) {
    return {
      x: config.region.x,
      y: config.region.y,
      width: clampDimension(config.region.width),
      height: clampDimension(config.region.height),
    };
  }

  return {
    x: 0,
    y: 0,
    width: clampDimension(baseWidth),
    height: clampDimension(baseHeight),
  };
}

export function ParticleEffect({
  config,
  baseWidth,
  baseHeight,
  baseFrustumHalfWidth,
  baseFrustumHalfHeight,
  parallaxFactor,
  parallaxMode,
  viewportRef,
  layerOffset,
}: ParticleEffectProps) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const positionAttributeRef = useRef<BufferAttribute>(null);
  const alphaAttributeRef = useRef<BufferAttribute>(null);
  const sizeAttributeRef = useRef<BufferAttribute>(null);
  const particlesRef = useRef<ParticleInstance[]>([]);
  const [texture, setTexture] = useState<Texture | null>(null);

  const maxCount = Math.max(0, Math.floor(config.maxCount ?? 50));
  const mode = config.mode ?? "twinkle";
  const zIndex = config.zIndex ?? 11;
  const opacity = config.opacity ?? 1;
  const maskSampler = useMaskSampler(config.maskSrc);
  const maskChannel = config.maskChannel ?? "r";
  const maskBehavior = config.maskBehavior ?? "spawn";
  const maskThreshold = config.maskThreshold ?? 0.1;

  useEffect(() => {
    if (!config.src) {
      setTexture(null);
      return;
    }

    const loader = new TextureLoader();
    let disposed = false;
    let loadedTexture: Texture | null = null;

    loader.load(
      config.src,
      (nextTexture) => {
        if (disposed) {
          nextTexture.dispose();
          return;
        }

        nextTexture.minFilter = LinearFilter;
        nextTexture.magFilter = LinearFilter;
        nextTexture.colorSpace = SRGBColorSpace;
        nextTexture.needsUpdate = true;
        loadedTexture = nextTexture;
        setTexture(nextTexture);
      },
      undefined,
      () => {
        if (!disposed) {
          setTexture(null);
        }
      }
    );

    return () => {
      disposed = true;
      if (loadedTexture) {
        loadedTexture.dispose();
      }
    };
  }, [config.src]);

  const positionArray = useMemo(() => new Float32Array(maxCount * 3), [maxCount]);
  const alphaArray = useMemo(() => new Float32Array(maxCount), [maxCount]);
  const sizeArray = useMemo(() => new Float32Array(maxCount), [maxCount]);

  useEffect(() => {
    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const initialRegion = resolveParticleRegion(
      config,
      viewport,
      baseWidth,
      baseHeight,
      baseFrustumHalfWidth,
      baseFrustumHalfHeight,
      layerOffset
    );

    if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
      particlesRef.current = initializeMaskedParticles(
        config,
        initialRegion.width,
        initialRegion.height,
        maxCount,
        maskSampler,
        maskChannel,
        maskThreshold
      );
      return;
    }

    particlesRef.current = initializeParticles(config, initialRegion.width, initialRegion.height, maxCount);
  }, [
    baseFrustumHalfHeight,
    baseFrustumHalfWidth,
    baseHeight,
    baseWidth,
    config.mode,
    config.size,
    config.sizeVariance,
    config.twinkleDuration,
    config.twinkleDurationVariance,
    config.driftDirection?.x,
    config.driftDirection?.y,
    config.driftDirectionVariance,
    config.driftSpeed,
    config.driftSpeedVariance,
    config.driftDistance,
    config.glowDuration,
    config.glowDurationVariance,
    config.glowMovement,
    config.glowStyle,
    config.region?.x,
    config.region?.y,
    config.region?.width,
    config.region?.height,
    config.regionMode,
    layerOffset.x,
    layerOffset.y,
    maxCount,
    maskBehavior,
    maskChannel,
    maskSampler,
    maskThreshold,
    viewportRef,
  ]);

  const uniforms = useMemo(() => {
    const baseUniforms: {
      uColor: { value: Color };
      uOpacity: { value: number };
      uTexture?: { value: Texture };
    } = {
      uColor: { value: new Color(config.color ?? "#ffffff") },
      uOpacity: { value: opacity },
    };

    if (texture) {
      baseUniforms.uTexture = { value: texture };
    }

    return baseUniforms;
  }, [config.color, opacity, texture]);

  useFrame((_, delta) => {
    const cappedDelta = Math.min(delta, 0.1);
    const particles = particlesRef.current;
    const viewport = viewportRef.current ?? { x: 0, y: 0, zoom: 1 };
    const region = resolveParticleRegion(
      config,
      viewport,
      baseWidth,
      baseHeight,
      baseFrustumHalfWidth,
      baseFrustumHalfHeight,
      layerOffset
    );

    if (materialRef.current) {
      materialRef.current.uniforms.uOpacity.value = opacity;
      materialRef.current.uniforms.uColor.value.set(config.color ?? "#ffffff");
      if (texture && materialRef.current.uniforms.uTexture) {
        materialRef.current.uniforms.uTexture.value = texture;
      }
    }

    for (let index = 0; index < maxCount; index += 1) {
      let particle = particles[index];
      if (!particle) {
        if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
          particle = createMaskedParticle(
            config,
            region.width,
            region.height,
            maskSampler,
            maskChannel,
            maskThreshold
          );
        } else {
          particle = initializeParticles(config, region.width, region.height, 1)[0];
        }
        particles[index] = particle;
      }

      if (mode === "drift") {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedDriftParticle(
            particle,
            cappedDelta,
            config,
            region.width,
            region.height,
            maskSampler,
            maskChannel,
            maskThreshold
          );
        } else {
          updateDriftParticle(particle, cappedDelta, config, region.width, region.height);
        }
      } else if (mode === "glow") {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedGlowParticle(
            particle,
            cappedDelta,
            config,
            region.width,
            region.height,
            maskSampler,
            maskChannel,
            maskThreshold
          );
        } else {
          updateGlowParticle(particle, cappedDelta, config, region.width, region.height);
        }
      } else {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedTwinkleParticle(
            particle,
            cappedDelta,
            region.width,
            region.height,
            maskSampler,
            maskChannel,
            maskThreshold
          );
        } else {
          updateTwinkleParticle(particle, cappedDelta, region.width, region.height);
        }
      }

      particle.x = wrapCoordinate(particle.x, region.width);
      particle.y = wrapCoordinate(particle.y, region.height);

      const worldX = region.x + particle.x - baseWidth / 2 + layerOffset.x;
      const worldY = baseHeight / 2 - (region.y + particle.y) + layerOffset.y;
      const baseOffset = index * 3;

      positionArray[baseOffset] = worldX;
      positionArray[baseOffset + 1] = worldY;
      positionArray[baseOffset + 2] = 0;
      alphaArray[index] = particle.alpha;
      let finalSize = particle.size;
      if (mode === "glow" && (config.glowStyle === "pulse" || config.glowStyle === "all")) {
        const t = (particle.elapsed % particle.cycleDuration) / particle.cycleDuration;
        const pulseFactor = Math.sin(t * Math.PI * 2) * 0.5 + 0.5;
        finalSize = particle.size * (1 + pulseFactor * 0.5);
      }
      sizeArray[index] = finalSize;
    }

    if (positionAttributeRef.current) {
      positionAttributeRef.current.needsUpdate = true;
    }
    if (alphaAttributeRef.current) {
      alphaAttributeRef.current.needsUpdate = true;
    }
    if (sizeAttributeRef.current) {
      sizeAttributeRef.current.needsUpdate = true;
    }

    const panOffsetX = viewport.x * (1 - parallaxFactor);
    const panOffsetY = viewport.y * (1 - parallaxFactor);

    let x = panOffsetX;
    let y = panOffsetY;
    if (parallaxMode === "drift" && parallaxFactor !== 1) {
      const driftStrength = 0.1;
      const zoomDrift = (viewport.zoom - 1) * (parallaxFactor - 1) * driftStrength;
      x += viewport.x * zoomDrift;
      y += viewport.y * zoomDrift;
    }

    if (pointsRef.current) {
      pointsRef.current.position.x = x;
      pointsRef.current.position.y = y;
      pointsRef.current.position.z = zIndex * 0.01;

      if (parallaxMode === "depth" && parallaxFactor !== 1) {
        const baseZoom = Math.max(0.001, viewport.zoom);
        const zoomFactor = computeParallaxScale(parallaxFactor, parallaxMode);
        const layerZoom = Math.max(0.001, 1 + (baseZoom - 1) * zoomFactor);
        const depthScale = layerZoom / baseZoom;
        pointsRef.current.scale.set(depthScale, depthScale, 1);
      } else {
        pointsRef.current.scale.set(1, 1, 1);
      }
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          ref={positionAttributeRef}
          attach="attributes-position"
          args={[positionArray, 3]}
        />
        <bufferAttribute
          ref={alphaAttributeRef}
          attach="attributes-alpha"
          args={[alphaArray, 1]}
        />
        <bufferAttribute
          ref={sizeAttributeRef}
          attach="attributes-particleSize"
          args={[sizeArray, 1]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={PARTICLE_VERTEX_SHADER}
        fragmentShader={
          config.mode === "glow"
            ? selectGlowFragmentShader(config.glowStyle ?? "all")
            : texture
              ? PARTICLE_FRAGMENT_SHADER_TEXTURE
              : PARTICLE_FRAGMENT_SHADER_CIRCLE
        }
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
