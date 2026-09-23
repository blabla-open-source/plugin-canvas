import type { CanvasAsset } from "./types";

export interface LeaferImageFill {
  changeful: boolean;
  mode: "cover" | "fit" | "repeat" | "stretch";
  type: "image";
  url: string;
}

export function createImageFill(
  url: string,
  imageDirectRendering: boolean
): LeaferImageFill {
  return {
    changeful: imageDirectRendering,
    mode: "stretch",
    type: "image",
    url
  };
}

export function isPreviewBackedAsset(asset: CanvasAsset): boolean {
  return (
    asset.kind === "image" ||
    asset.kind === "video" ||
    asset.kind === "pdf" ||
    asset.kind === "presentation" ||
    asset.kind === "model"
  );
}

export function previewUrlForAsset(asset: CanvasAsset): string | null {
  return asset.url ?? asset.snapshotUrl ?? asset.thumbnailUrl ?? null;
}
