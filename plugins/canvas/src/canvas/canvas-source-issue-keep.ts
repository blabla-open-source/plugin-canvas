import { updatePromotedCanvasAssetPreview } from "./canvas-scene-promoted-assets";
import type { CanvasResolvedSourceIssue } from "./canvas-source-status";
import { acknowledgeCanvasAssetSourceIssue } from "./scene-store";
import type { CanvasAsset, CanvasScene } from "./types";

const DURABLE_CANVAS_MATERIAL_HOSTS = new Set([
  "canvas-asset",
  "page-snapshot"
]);

export function canvasAssetHasDurableCurrentVisual(
  asset: CanvasAsset
): boolean {
  if (typeof asset.acceptedTextSnapshot === "string") {
    return true;
  }

  return (
    isDurableCanvasMaterialUrl(asset.snapshotUrl) ||
    isDurableCanvasMaterialUrl(asset.url)
  );
}

export function isDurableCanvasMaterialUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "app-file:" &&
      DURABLE_CANVAS_MATERIAL_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function keepCanvasAssetSourceIssueCurrent(input: {
  asset: CanvasAsset | undefined;
  canvasAssetId: string;
  issue: CanvasResolvedSourceIssue;
  scene: CanvasScene;
}): CanvasScene {
  if (!input.asset || canvasAssetHasDurableCurrentVisual(input.asset)) {
    return acknowledgeCanvasAssetSourceIssue(
      input.scene,
      input.canvasAssetId,
      input.issue
    );
  }

  return input.scene;
}

export function keepPromotedCanvasAssetSourceIssueCurrent(input: {
  canvasAssetId: string;
  issue: CanvasResolvedSourceIssue;
  promotedAsset: Parameters<typeof updatePromotedCanvasAssetPreview>[1];
  scene: CanvasScene;
}): CanvasScene {
  return acknowledgeCanvasAssetSourceIssue(
    updatePromotedCanvasAssetPreview(input.scene, input.promotedAsset),
    input.canvasAssetId,
    input.issue
  );
}
