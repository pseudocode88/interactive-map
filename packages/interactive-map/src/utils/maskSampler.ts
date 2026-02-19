import type { MaskChannel } from "../types";

/**
 * CPU-side mask sampler that reads pixel data from an offscreen canvas.
 * Used by the particle system to check spawn/constraint positions.
 */
export interface MaskSampler {
  /** Width of the mask image in pixels */
  width: number;
  /** Height of the mask image in pixels */
  height: number;
  /**
   * Sample the mask at the given coordinates.
   * @param x - X coordinate in mask pixel space (0 to width-1).
   * @param y - Y coordinate in mask pixel space (0 to height-1).
   * @param channel - Which channel to read ("r", "g", or "b").
   * @returns Channel value normalized to 0–1.
   */
  sample(x: number, y: number, channel: MaskChannel): number;
  /** Release the offscreen canvas resources. */
  dispose(): void;
}

const CHANNEL_OFFSETS: Record<MaskChannel, number> = {
  r: 0,
  g: 1,
  b: 2,
};

/**
 * Creates a MaskSampler from an already-loaded HTMLImageElement.
 * Draws the image onto an offscreen canvas and reads the pixel data once.
 */
export function createMaskSampler(image: HTMLImageElement): MaskSampler {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Failed to get 2D context for mask sampler");
  }

  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  return {
    width: canvas.width,
    height: canvas.height,
    sample(x: number, y: number, channel: MaskChannel): number {
      const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
      const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));
      const index = (py * canvas.width + px) * 4 + CHANNEL_OFFSETS[channel];
      return pixels[index] / 255;
    },
    dispose() {
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/**
 * Loads a mask image from a URL and creates a MaskSampler.
 * Returns a promise that resolves to the sampler.
 */
export function loadMaskSampler(src: string): Promise<MaskSampler> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(createMaskSampler(img));
    img.onerror = () => reject(new Error(`Failed to load mask image: ${src}`));
    img.src = src;
  });
}
