import { useEffect, useRef, useState } from "react";
import { LinearFilter, SRGBColorSpace, Texture, TextureLoader } from "three";

/**
 * Loads a mask texture from a URL. Returns null if no src is provided.
 * Uses imperative TextureLoader (not useLoader hook) to allow conditional loading.
 */
export function useMaskTexture(src?: string, onLoadComplete?: () => void): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
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
      setTexture((prev) => {
        if (prev) {
          prev.dispose();
        }
        return null;
      });
      reportComplete();
      return;
    }

    const loader = new TextureLoader();
    let cancelled = false;

    loader.load(
      src,
      (loadedTexture) => {
        if (cancelled) {
          loadedTexture.dispose();
          return;
        }

        loadedTexture.colorSpace = SRGBColorSpace;
        loadedTexture.minFilter = LinearFilter;
        loadedTexture.magFilter = LinearFilter;
        loadedTexture.needsUpdate = true;
        setTexture((prev) => {
          if (prev) {
            prev.dispose();
          }
          return loadedTexture;
        });
        reportComplete();
      },
      undefined,
      () => {
        if (cancelled) {
          return;
        }

        setTexture((prev) => {
          if (prev) {
            prev.dispose();
          }
          return null;
        });
        reportComplete();
      }
    );

    return () => {
      cancelled = true;
      setTexture((prev) => {
        if (prev) {
          prev.dispose();
        }
        return null;
      });
    };
  }, [src]);

  return texture;
}
