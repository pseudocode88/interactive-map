export interface SpriteSheetMeta {
  frameWidth: number;
  frameHeight: number;
  cols: number;
  rows: number;
  frameCount: number;
}

/** Auto-detect grid layout from image dimensions. Assumes square frames. */
export function detectGrid(imageWidth: number, imageHeight: number): SpriteSheetMeta {
  const frameSize = Math.min(imageWidth, imageHeight);
  const cols = Math.max(1, Math.floor(imageWidth / frameSize));
  const rows = Math.max(1, Math.floor(imageHeight / frameSize));

  return {
    frameWidth: frameSize,
    frameHeight: frameSize,
    cols,
    rows,
    frameCount: cols * rows,
  };
}

/** Get UV offset and repeat for a given frame index in a grid sprite sheet. */
export function getFrameUV(
  frameIndex: number,
  cols: number,
  rows: number
): { offsetX: number; offsetY: number; repeatX: number; repeatY: number } {
  const safeFrame = Math.max(0, frameIndex);
  const col = safeFrame % cols;
  const row = rows - 1 - Math.floor(safeFrame / cols);

  return {
    offsetX: col / cols,
    offsetY: row / rows,
    repeatX: 1 / cols,
    repeatY: 1 / rows,
  };
}
