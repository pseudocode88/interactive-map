import { useFrame } from "@react-three/fiber";
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
import { useMaskSampler } from "../hooks/useMaskSampler";
import type { ParticleEffectConfig, PinnedParticleEffectConfig } from "../types";
import {
  PARTICLE_FRAGMENT_SHADER_CIRCLE,
  PARTICLE_FRAGMENT_SHADER_TEXTURE,
  PARTICLE_VERTEX_SHADER,
} from "../utils/particleShaders";
import {
  createMaskedParticle,
  initializeMaskedParticles,
  initializeParticles,
  type ParticleInstance,
  updateMaskedDriftParticle,
  updateMaskedTwinkleParticle,
  updateDriftParticle,
  updateTwinkleParticle,
} from "../utils/particles";

interface PinnedParticleEffectProps {
  config: PinnedParticleEffectConfig;
  /** Width of the parent layer's geometry (includes autoScale) */
  geoWidth: number;
  /** Height of the parent layer's geometry (includes autoScale) */
  geoHeight: number;
}

function wrapCoordinate(value: number, size: number): number {
  if (size <= 0) {
    return 0;
  }

  return ((value % size) + size) % size;
}

function createFallbackParticle(
  particleConfig: ParticleEffectConfig,
  regionWidth: number,
  regionHeight: number
): ParticleInstance {
  return initializeParticles(particleConfig, regionWidth, regionHeight, 1)[0];
}

export function PinnedParticleEffect({
  config,
  geoWidth,
  geoHeight,
}: PinnedParticleEffectProps) {
  const pointsRef = useRef<Points>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const positionAttributeRef = useRef<BufferAttribute>(null);
  const alphaAttributeRef = useRef<BufferAttribute>(null);
  const sizeAttributeRef = useRef<BufferAttribute>(null);
  const particlesRef = useRef<ParticleInstance[]>([]);
  const [texture, setTexture] = useState<Texture | null>(null);

  const maxCount = Math.max(0, Math.floor(config.maxCount ?? 50));
  const mode = config.mode ?? "twinkle";
  const opacity = config.opacity ?? 1;
  const localZOffset = config.localZOffset ?? 0.002;
  const maskSampler = useMaskSampler(config.maskSrc);
  const maskChannel = config.maskChannel ?? "r";
  const maskBehavior = config.maskBehavior ?? "both";
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

  const particleUtilConfig = useMemo<ParticleEffectConfig>(
    () => ({
      id: config.id,
      mode: config.mode,
      maxCount: config.maxCount,
      color: config.color,
      size: config.size,
      sizeVariance: config.sizeVariance,
      src: config.src,
      twinkleDuration: config.twinkleDuration,
      twinkleDurationVariance: config.twinkleDurationVariance,
      driftDirection: config.driftDirection,
      driftDirectionVariance: config.driftDirectionVariance,
      driftSpeed: config.driftSpeed,
      driftSpeedVariance: config.driftSpeedVariance,
      driftDistance: config.driftDistance,
    }),
    [
      config.color,
      config.driftDirection,
      config.driftDirectionVariance,
      config.driftDistance,
      config.driftSpeed,
      config.driftSpeedVariance,
      config.id,
      config.maxCount,
      config.mode,
      config.size,
      config.sizeVariance,
      config.src,
      config.twinkleDuration,
      config.twinkleDurationVariance,
    ]
  );

  useEffect(() => {
    if (maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")) {
      particlesRef.current = initializeMaskedParticles(
        particleUtilConfig,
        geoWidth,
        geoHeight,
        maxCount,
        maskSampler,
        maskChannel,
        maskThreshold
      );
      return;
    }

    particlesRef.current = initializeParticles(
      particleUtilConfig,
      geoWidth,
      geoHeight,
      maxCount
    );
  }, [
    geoHeight,
    geoWidth,
    maskBehavior,
    maskChannel,
    maskSampler,
    maskThreshold,
    maxCount,
    particleUtilConfig,
  ]);

  const uniforms = useMemo(() => {
    const baseUniforms: Record<string, { value: unknown }> = {
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
        particle =
          maskSampler && (maskBehavior === "spawn" || maskBehavior === "both")
            ? createMaskedParticle(
                particleUtilConfig,
                geoWidth,
                geoHeight,
                maskSampler,
                maskChannel,
                maskThreshold
              )
            : createFallbackParticle(particleUtilConfig, geoWidth, geoHeight);
        particles[index] = particle;
      }

      if (mode === "drift") {
        if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
          updateMaskedDriftParticle(
            particle,
            cappedDelta,
            particleUtilConfig,
            geoWidth,
            geoHeight,
            maskSampler,
            maskChannel,
            maskThreshold
          );
        } else {
          updateDriftParticle(
            particle,
            cappedDelta,
            particleUtilConfig,
            geoWidth,
            geoHeight
          );
        }
      } else if (maskSampler && (maskBehavior === "constrain" || maskBehavior === "both")) {
        updateMaskedTwinkleParticle(
          particle,
          cappedDelta,
          geoWidth,
          geoHeight,
          maskSampler,
          maskChannel,
          maskThreshold
        );
      } else {
        updateTwinkleParticle(particle, cappedDelta, geoWidth, geoHeight);
      }

      particle.x = wrapCoordinate(particle.x, geoWidth);
      particle.y = wrapCoordinate(particle.y, geoHeight);

      const localX = particle.x - geoWidth / 2;
      const localY = geoHeight / 2 - particle.y;
      const offset = index * 3;
      positionArray[offset] = localX;
      positionArray[offset + 1] = localY;
      positionArray[offset + 2] = 0;
      alphaArray[index] = particle.alpha;
      sizeArray[index] = particle.size;
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
  });

  return (
    <points ref={pointsRef} position={[0, 0, localZOffset]}>
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
        fragmentShader={texture ? PARTICLE_FRAGMENT_SHADER_TEXTURE : PARTICLE_FRAGMENT_SHADER_CIRCLE}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
