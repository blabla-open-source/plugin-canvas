import type {
  CanvasCollageLayout,
  CanvasCollagePlacement,
  CanvasCollageRect
} from "./canvas-collage-layout";
import {
  canvasCollagePackedContentBounds,
  createCanvasCollageLayout
} from "./canvas-collage-layout";
import {
  drawCanvasCollageFileCard,
  drawCanvasCollageTextCard
} from "./canvas-collage-text-render";
import type { CanvasAsset, CanvasScene } from "./types";

const IMAGE_LOAD_CONCURRENCY = 12;
const MIN_CANVAS_THUMBNAIL_EDGE = 96;

export interface CanvasCollageThumbnailExport {
  dataUrl: string;
  height: number;
  width: number;
}

export function canvasThumbnailSizeForScene(
  scene: CanvasScene,
  fallbackSize: { height: number; width: number }
): { height: number; width: number } {
  const contentBounds = canvasCollagePackedContentBounds(scene);
  if (!contentBounds) {
    return fallbackSize;
  }

  const aspect = contentBounds.width / contentBounds.height;
  if (!(aspect > 0) || !Number.isFinite(aspect)) {
    return fallbackSize;
  }

  const longEdge = Math.max(fallbackSize.height, fallbackSize.width);
  if (aspect >= 1) {
    return {
      height: Math.max(
        MIN_CANVAS_THUMBNAIL_EDGE,
        Math.round(longEdge / aspect)
      ),
      width: longEdge
    };
  }

  return {
    height: longEdge,
    width: Math.max(MIN_CANVAS_THUMBNAIL_EDGE, Math.round(longEdge * aspect))
  };
}

export async function exportCanvasCollageThumbnail({
  height,
  quality = 0.82,
  scene,
  width
}: {
  height: number;
  quality?: number;
  scene: CanvasScene;
  width: number;
}): Promise<CanvasCollageThumbnailExport> {
  const layout = createCanvasCollageLayout({
    scene,
    size: { height, width }
  });
  const canvas = document.createElement("canvas");
  canvas.height = height;
  canvas.width = width;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas is unavailable.");
  }

  const images = await loadPlacementImages(scene, layout);
  for (const placement of layout.placements) {
    drawPlacement(
      context,
      placement,
      scene.assets[placement.candidate.assetId],
      images
    );
  }

  return {
    dataUrl: await canvasToWebpDataUrl(canvas, quality),
    height,
    width
  };
}

async function loadPlacementImages(
  scene: CanvasScene,
  layout: CanvasCollageLayout
): Promise<Map<string, HTMLImageElement>> {
  const imagePlacements = layout.placements.filter((placement) => {
    const asset = scene.assets[placement.candidate.assetId];
    return Boolean(asset?.url && placement.candidate.kind === "image");
  });
  const entries: [string, HTMLImageElement][] = [];
  let nextIndex = 0;
  const workers = Array.from(
    {
      length: Math.min(IMAGE_LOAD_CONCURRENCY, imagePlacements.length)
    },
    async () => {
      while (nextIndex < imagePlacements.length) {
        const placement = imagePlacements[nextIndex];
        nextIndex += 1;
        if (!placement) {
          continue;
        }

        const asset = scene.assets[placement.candidate.assetId];
        if (!asset?.url) {
          continue;
        }

        const image = await loadImage(asset.url);
        if (image) {
          entries.push([placement.candidate.nodeId, image]);
        }
      }
    }
  );
  await Promise.all(workers);
  return new Map(entries);
}

function drawPlacement(
  context: CanvasRenderingContext2D,
  placement: CanvasCollagePlacement,
  asset: CanvasAsset | undefined,
  images: ReadonlyMap<string, HTMLImageElement>
) {
  if (!asset) {
    return;
  }

  if (placement.candidate.kind === "image") {
    const image = images.get(placement.candidate.nodeId);
    if (image) {
      drawRotatedPlacement(context, placement, () => {
        drawImageLayer(context, placement.contentFrame, image);
      });
      return;
    }
  }

  if (placement.candidate.kind === "text") {
    drawRotatedPlacement(context, placement, () => {
      drawCanvasCollageTextCard(context, placement, asset);
    });
    return;
  }

  drawRotatedPlacement(context, placement, () => {
    drawCanvasCollageFileCard(context, placement, asset);
  });
}

function drawImageLayer(
  context: CanvasRenderingContext2D,
  frame: CanvasCollageRect,
  image: HTMLImageElement
) {
  if (!(frame.width > 0 && frame.height > 0)) {
    return;
  }

  context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
}

function drawRotatedPlacement(
  context: CanvasRenderingContext2D,
  placement: CanvasCollagePlacement,
  draw: () => void
) {
  context.save();
  if (placement.candidate.rotation !== 0) {
    const centerX = placement.contentFrame.x + placement.contentFrame.width / 2;
    const centerY =
      placement.contentFrame.y + placement.contentFrame.height / 2;
    context.translate(centerX, centerY);
    context.rotate((placement.candidate.rotation * Math.PI) / 180);
    context.translate(-centerX, -centerY);
  }
  draw();
  context.restore();
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function canvasToWebpDataUrl(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Canvas collage export produced an empty blob."));
          return;
        }

        const reader = new FileReader();
        reader.addEventListener("load", () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
            return;
          }

          reject(new Error("Canvas collage export produced a non-string URL."));
        });
        reader.addEventListener("error", () => {
          reject(reader.error ?? new Error("Canvas collage read failed."));
        });
        reader.readAsDataURL(blob);
      },
      "image/webp",
      quality
    );
  });
}
