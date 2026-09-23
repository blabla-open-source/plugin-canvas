import type { CanvasAsset, CanvasNode } from "./types";

export const CANVAS_VIDEO_NODE_MIN_SIZE = {
  height: 135,
  width: 240
} as const;

export interface CanvasNodeMinimumSize {
  height: number;
  width: number;
}

export function canvasAssetMinimumNodeSize(
  asset: CanvasAsset
): CanvasNodeMinimumSize | null {
  if (asset.kind !== "video") {
    return null;
  }

  return {
    height: Math.min(CANVAS_VIDEO_NODE_MIN_SIZE.height, asset.height),
    width: Math.min(CANVAS_VIDEO_NODE_MIN_SIZE.width, asset.width)
  };
}

export function constrainCanvasNodeLayout(
  asset: CanvasAsset | null | undefined,
  layout: Pick<CanvasNode, "height" | "width">
): Pick<CanvasNode, "height" | "width"> {
  if (!asset) {
    return layout;
  }

  const minimumSize = canvasAssetMinimumNodeSize(asset);

  if (!minimumSize) {
    return layout;
  }

  return {
    height: Math.max(layout.height, minimumSize.height),
    width: Math.max(layout.width, minimumSize.width)
  };
}
