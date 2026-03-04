import { useEffect, useState } from "react";

interface ImageSize {
  width: number;
  height: number;
}

export function useBaseImageSize(src: string): ImageSize | null {
  const [size, setSize] = useState<ImageSize | null>(null);

  useEffect(() => {
    if (!src) {
      setSize(null);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setSize({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        console.warn(`[InteractiveMap] Failed to load base image: ${src}`);
      }
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return size;
}
