import type { CanvasDocument } from "../canvas/canvas-document-types";
import {
  isCanvasDocumentAttachmentFile,
  resolveCanvasDocumentAttachmentAsset
} from "../canvas/canvas-document-attachment";
import type { CanvasAsset } from "../canvas/types";
import type {
  BlablaHostBridge,
  BlablaHostFileReference
} from "./host-api";
import { fileReferenceToPromotedCanvasAsset } from "./host-file-reference-promoted-asset";

export interface ResolvedJsonCanvasFileReferences {
  document: CanvasDocument;
  references: BlablaHostFileReference[];
}

export async function resolveJsonCanvasFileReferences(
  document: CanvasDocument,
  hostBridge: Pick<BlablaHostBridge, "document" | "fileReferences">
): Promise<ResolvedJsonCanvasFileReferences> {
  const files = uniqueResolvableJsonCanvasFiles(
    Object.values(document.scene.assets)
  );
  if (files.length === 0) {
    return {
      document,
      references: []
    };
  }

  const attachmentFiles = files.filter(isCanvasDocumentAttachmentFile);
  const referenceFiles = files.filter(
    (file) => !isCanvasDocumentAttachmentFile(file)
  );
  const [attachments, resolutions] = await Promise.all([
    hostBridge.document.resolveAttachments({ files: attachmentFiles }),
    hostBridge.fileReferences.resolveDocumentFiles({ files: referenceFiles })
  ]);
  const attachmentByFile = new Map(
    attachments.map((attachment) => [attachment.file, attachment])
  );
  const referenceByFile = new Map(
    resolutions.map((resolution) => [
      resolution.file,
      resolution.reference
    ])
  );
  if (attachmentByFile.size === 0 && referenceByFile.size === 0) {
    return {
      document,
      references: []
    };
  }

  const assets = { ...document.scene.assets };
  for (const asset of Object.values(document.scene.assets)) {
    if (!asset.jsonCanvasFile) {
      continue;
    }

    const attachment = attachmentByFile.get(asset.jsonCanvasFile);
    if (attachment) {
      assets[asset.id] = resolveCanvasDocumentAttachmentAsset(
        asset,
        attachment
      );
      continue;
    }

    const reference = referenceByFile.get(asset.jsonCanvasFile);
    if (!reference) {
      continue;
    }

    assets[asset.id] = resolvedAssetFromReference(asset, reference);
  }

  return {
    document: {
      ...document,
      scene: {
        ...document.scene,
        assets
      }
    },
    references: resolutions.map((resolution) => resolution.reference)
  };
}

function resolvedAssetFromReference(
  asset: CanvasAsset,
  reference: BlablaHostFileReference
): CanvasAsset {
  const promoted = fileReferenceToPromotedCanvasAsset(reference, {
    assetId: asset.id,
    jsonCanvasFile: asset.jsonCanvasFile
  });
  if (
    asset.sourceFingerprint &&
    promoted.sourceFingerprint &&
    asset.sourceFingerprint !== promoted.sourceFingerprint
  ) {
    return {
      ...asset,
      sourceAssetId: promoted.sourceAssetId,
      jsonCanvasFile: asset.jsonCanvasFile
    };
  }

  return {
    ...asset,
    ...promoted,
    height: asset.height,
    id: asset.id,
    jsonCanvasFile: asset.jsonCanvasFile,
    width: asset.width
  };
}

function uniqueResolvableJsonCanvasFiles(
  assets: readonly CanvasAsset[]
): string[] {
  return Array.from(
    new Set(
      assets
        .map((asset) => asset.jsonCanvasFile?.trim() ?? "")
        .filter(
          (file) => file.length > 0 && !isUnsupportedJsonCanvasFileUrl(file)
        )
    )
  );
}

function isUnsupportedJsonCanvasFileUrl(file: string): boolean {
  try {
    const url = new URL(file);
    return url.protocol !== "file:";
  } catch {
    return false;
  }
}
