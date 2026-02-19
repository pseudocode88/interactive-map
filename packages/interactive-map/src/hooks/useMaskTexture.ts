import { useEffect, useState } from "react";
import { LinearFilter, SRGBColorSpace, Texture, TextureLoader } from "three";

/**
 * Loads a mask texture from a URL. Returns null if no src is provided.
 * Uses imperative TextureLoader (not useLoader hook) to allow conditional loading.
 */
export function useMaskTexture(src?: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    if (!src) {
      setTexture((prev) => {
        if (prev) {
          prev.dispose();
        }
        return null;
      });
      return;
    }

    const loader = new TextureLoader();
    let cancelled = false;

    loader.load(src, (loadedTexture) => {
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
    });

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
