import { useEffect, useState } from "react";
import { LoadingStage } from "../context/LoadingManagerContext";
import { useLoadingManager } from "./useLoadingManager";

interface ImageSize {
  width: number;
  height: number;
}

export function useBaseImageSize(src: string): ImageSize | null {
  const [size, setSize] = useState<ImageSize | null>(null);
  const { registerStage, completeStage } = useLoadingManager();

  useEffect(() => {
    registerStage(LoadingStage.BASE_IMAGE, "Loading base image");

    if (!src) {
      setSize(null);
      completeStage(LoadingStage.BASE_IMAGE);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setSize({ width: image.naturalWidth, height: image.naturalHeight });
        completeStage(LoadingStage.BASE_IMAGE);
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        console.warn(`[InteractiveMap] Failed to load base image: ${src}`);
        completeStage(LoadingStage.BASE_IMAGE);
      }
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [completeStage, registerStage, src]);

  return size;
}
