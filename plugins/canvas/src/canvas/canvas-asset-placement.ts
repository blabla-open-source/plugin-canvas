import {
  createNodesFromPromotedCanvasAssets,
  type PromotedCanvasAssetInput
} from "./canvas-scene-promoted-assets";
import type { CanvasSceneTargets as CanvasSceneTargetsShape } from "./canvas-scene-targets";
import type { CanvasPoint, CanvasScene } from "./types";

export type CanvasSceneTargets = CanvasSceneTargetsShape;

export function createPromotedCanvasAssetPatch(input: {
  point: CanvasPoint;
  promotedAssets: PromotedCanvasAssetInput[];
  startZ: number;
}): CanvasScene {
  return createNodesFromPromotedCanvasAssets(
    input.promotedAssets,
    input.point,
    input.startZ
  );
}

export function isPreviewablePromotedAsset(
  asset: PromotedCanvasAssetInput
): boolean {
  return (
    asset.kind === "video" ||
    asset.kind === "pdf" ||
    asset.kind === "presentation" ||
    asset.kind === "model"
  );
}
