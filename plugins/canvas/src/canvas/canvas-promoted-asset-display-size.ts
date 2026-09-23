import type { PromotedCanvasAssetInput } from "./canvas-scene-promoted-assets";

export const DEFAULT_VISUAL_CARD_SIZE = {
  height: 240,
  width: 320
};

const CANVAS_IMAGE_MAX_DISPLAY_EDGE = 5000;

const DEFAULT_VIDEO_SIZE = {
  height: 360,
  width: 640
};

export function displaySizeForPromotedAsset(
  promotedAsset: PromotedCanvasAssetInput
): { height: number; width: number } {
  if (
    promotedAsset.kind === "image" &&
    promotedAsset.sourcePageNumber === undefined
  ) {
    return containedDisplaySize({
      fallbackSize: DEFAULT_VISUAL_CARD_SIZE,
      height: promotedAsset.height,
      maxSize: {
        height: CANVAS_IMAGE_MAX_DISPLAY_EDGE,
        width: CANVAS_IMAGE_MAX_DISPLAY_EDGE
      },
      width: promotedAsset.width
    });
  }

  if (promotedAsset.kind === "video" || promotedAsset.kind === "model") {
    return boundedDisplaySize({
      height: promotedAsset.height,
      maxSize: DEFAULT_VIDEO_SIZE,
      width: promotedAsset.width
    });
  }

  if (
    promotedAsset.kind === "image" ||
    promotedAsset.kind === "pdf" ||
    promotedAsset.kind === "presentation"
  ) {
    return boundedDisplaySize({
      height: promotedAsset.height,
      maxSize: DEFAULT_VISUAL_CARD_SIZE,
      width: promotedAsset.width
    });
  }

  return {
    height: promotedAsset.height,
    width: promotedAsset.width
  };
}

function boundedDisplaySize({
  height,
  maxSize,
  width
}: {
  height: number | undefined;
  maxSize: { height: number; width: number };
  width: number | undefined;
}): { height: number; width: number } {
  if (
    !(width && height && Number.isFinite(width) && Number.isFinite(height)) ||
    width <= 0 ||
    height <= 0
  ) {
    return maxSize;
  }

  const scale = Math.min(maxSize.width / width, maxSize.height / height);

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale))
  };
}

function containedDisplaySize({
  fallbackSize,
  height,
  maxSize,
  width
}: {
  fallbackSize: { height: number; width: number };
  height: number | undefined;
  maxSize: { height: number; width: number };
  width: number | undefined;
}): { height: number; width: number } {
  if (
    !(width && height && Number.isFinite(width) && Number.isFinite(height)) ||
    width <= 0 ||
    height <= 0
  ) {
    return fallbackSize;
  }

  const scale = Math.min(1, maxSize.width / width, maxSize.height / height);

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale))
  };
}
