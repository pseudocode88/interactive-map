import { useEffect, useRef, useState } from "react";
import { loadMaskSampler, type MaskSampler } from "../utils/maskSampler";

/**
 * Loads a mask image and returns a CPU-side MaskSampler for pixel-level sampling.
 * Returns null while loading or if no src is provided.
 * Disposes the sampler on unmount or when src changes.
 */
export function useMaskSampler(src?: string, onLoadComplete?: () => void): MaskSampler | null {
  const [sampler, setSampler] = useState<MaskSampler | null>(null);
  const onLoadCompleteRef = useRef(onLoadComplete);

  useEffect(() => {
    onLoadCompleteRef.current = onLoadComplete;
  }, [onLoadComplete]);

  useEffect(() => {
    let hasReported = false;
    const reportComplete = () => {
      if (!hasReported) {
        hasReported = true;
        onLoadCompleteRef.current?.();
      }
    };

    if (!src) {
      setSampler(null);
      reportComplete();
      return;
    }

    let cancelled = false;
    let loadedSampler: MaskSampler | null = null;

    loadMaskSampler(src)
      .then((nextSampler) => {
        if (cancelled) {
          nextSampler.dispose();
          return;
        }
        loadedSampler = nextSampler;
        setSampler(nextSampler);
        reportComplete();
      })
      .catch(() => {
        if (!cancelled) {
          setSampler(null);
          reportComplete();
        }
      });

    return () => {
      cancelled = true;
      if (loadedSampler) {
        loadedSampler.dispose();
      }
      setSampler(null);
    };
  }, [src]);

  return sampler;
}
