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

    const image = new Image();
    image.onload = () => {
      setSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = src;
  }, [src]);

  return size;
}
