import type { CanvasPoint } from "./types";

interface CanvasViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export function clientPointToCanvasPoint(
  clientX: number,
  clientY: number,
  viewOrigin: Pick<DOMRectReadOnly, "left" | "top">,
  viewport: CanvasViewportTransform
): CanvasPoint {
  return {
    x: (clientX - viewOrigin.left - viewport.x) / viewport.zoom,
    y: (clientY - viewOrigin.top - viewport.y) / viewport.zoom
  };
}
