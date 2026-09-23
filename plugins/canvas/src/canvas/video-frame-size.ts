export interface VideoFrameSizeInput {
  displayHeight: number;
  displayWidth: number;
  sourceHeight: number;
  sourceWidth: number;
}

export function videoFrameCanvasSize({
  displayHeight,
  displayWidth,
  sourceHeight,
  sourceWidth
}: VideoFrameSizeInput): { height: number; width: number } {
  const width = Math.max(
    normalizeVideoFrameSide(sourceWidth),
    normalizeVideoFrameSide(displayWidth)
  );
  const height = Math.max(
    normalizeVideoFrameSide(sourceHeight),
    normalizeVideoFrameSide(displayHeight)
  );

  if (!(width > 0 && height > 0)) {
    throw new Error("Video frame has no drawable size");
  }

  return { height, width };
}

function normalizeVideoFrameSide(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
