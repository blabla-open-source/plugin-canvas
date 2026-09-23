export interface CanvasCollageRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface CanvasCollagePoint {
  x: number;
  y: number;
}

export function boundsForRects(
  rects: readonly CanvasCollageRect[]
): CanvasCollageRect {
  const first = rects[0];
  if (!first) {
    return { height: 1, width: 1, x: 0, y: 0 };
  }

  const minX = Math.min(...rects.map((rect) => rect.x));
  const minY = Math.min(...rects.map((rect) => rect.y));
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height));

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY
  };
}

export function insetFrame(
  frame: CanvasCollageRect,
  inset: number
): CanvasCollageRect {
  return {
    height: Math.max(1, frame.height - inset * 2),
    width: Math.max(1, frame.width - inset * 2),
    x: frame.x + inset,
    y: frame.y + inset
  };
}

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360;
  return normalized === 0 ? 0 : normalized;
}

export function rectCenter(rect: CanvasCollageRect): CanvasCollagePoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

export function rotatePoint(
  point: CanvasCollagePoint,
  center: CanvasCollagePoint,
  rotation: number
): CanvasCollagePoint {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;

  return {
    x: center.x + x * cos - y * sin,
    y: center.y + x * sin + y * cos
  };
}

export function rotatedRectBounds(
  rect: CanvasCollageRect,
  rotation: number
): CanvasCollageRect {
  if (rotation === 0) {
    return rect;
  }

  const center = rectCenter(rect);
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ].map((point) => rotatePoint(point, center, rotation));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));

  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY
  };
}

export function sizeFrame(size: {
  height: number;
  width: number;
}): CanvasCollageRect {
  return {
    height: size.height,
    width: size.width,
    x: 0,
    y: 0
  };
}
