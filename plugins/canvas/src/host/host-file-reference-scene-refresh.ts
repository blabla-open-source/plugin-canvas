import { refreshPromotedCanvasAssetPreview } from "../canvas/canvas-scene-promoted-assets";
import type { CanvasScene } from "../canvas/types";
import type { BlablaHostFileReference } from "./host-api";
import { fileReferenceToPromotedCanvasAsset } from "./host-file-reference-promoted-asset";

export function refreshSceneFromHostFileReferences(
  scene: CanvasScene,
  references: readonly BlablaHostFileReference[],
): CanvasScene {
  if (references.length === 0) {
    return scene;
  }

  const referencesById = new Map(
    references.map((reference) => [reference.id, reference]),
  );
  let nextScene = scene;

  for (const asset of Object.values(scene.assets)) {
    if (!(asset.sourceAssetId && asset.sourcePageNumber === undefined)) {
      continue;
    }

    const reference = referencesById.get(asset.sourceAssetId);
    if (!reference) {
      continue;
    }

    const promotedAsset = preserveJsonCanvasNodeDisplaySize(
      fileReferenceToPromotedCanvasAsset(reference, {
        assetId: asset.id,
        jsonCanvasFile: asset.jsonCanvasFile,
      }),
      asset,
    );
    nextScene = refreshPromotedCanvasAssetPreview(nextScene, promotedAsset);
  }

  return nextScene;
}

function preserveJsonCanvasNodeDisplaySize<
  T extends ReturnType<typeof fileReferenceToPromotedCanvasAsset>,
>(promotedAsset: T, asset: CanvasScene["assets"][string]): T {
  if (!asset.jsonCanvasFile) {
    return promotedAsset;
  }

  return {
    ...promotedAsset,
    height: asset.height,
    width: asset.width,
  };
}
