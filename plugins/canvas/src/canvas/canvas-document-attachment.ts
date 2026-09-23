import type { BlablaHostDocumentAttachment } from "../host/host-api";
import type { PromotedCanvasAssetInput } from "./canvas-scene-promoted-assets";
import type { CanvasAsset } from "./types";

const CANVAS_DOCUMENT_ATTACHMENT_PATTERN =
  /^attachments\/[a-f0-9]{64}\.(avif|bmp|gif|jpe?g|png|webp)$/;

export function isCanvasDocumentAttachmentFile(file: string): boolean {
  return CANVAS_DOCUMENT_ATTACHMENT_PATTERN.test(
    file.trim().replaceAll("\\", "/"),
  );
}

export function isCanvasSourceBackedPageAttachment(
  asset: Pick<
    CanvasAsset,
    "jsonCanvasFile" | "sourceAssetId" | "sourcePageNumber"
  >,
): boolean {
  return (
    asset.jsonCanvasFile !== undefined &&
    isCanvasDocumentAttachmentFile(asset.jsonCanvasFile) &&
    asset.sourceAssetId !== undefined &&
    asset.sourcePageNumber !== undefined
  );
}

export function isResolvedCanvasSourceBackedPageAttachment(
  asset: Pick<
    CanvasAsset,
    "jsonCanvasFile" | "sourceAssetId" | "sourcePageNumber" | "url"
  >,
): boolean {
  if (!(isCanvasSourceBackedPageAttachment(asset) && asset.url)) {
    return false;
  }

  try {
    const url = new URL(asset.url);
    return url.protocol === "app-file:" && url.hostname === "document-attachment";
  } catch {
    return false;
  }
}

export function resolveCanvasDocumentAttachmentAsset(
  asset: CanvasAsset,
  attachment: BlablaHostDocumentAttachment,
): CanvasAsset {
  const sourceBackedPage = isCanvasSourceBackedPageAttachment(asset);
  return {
    ...asset,
    byteSize: attachment.byteSize,
    jsonCanvasFile: attachment.file,
    kind: "image",
    mediaUrl: undefined,
    mime: attachment.mime,
    name: asset.name || attachment.name,
    remoteVideo: undefined,
    snapshotUrl: undefined,
    sourceAssetId: sourceBackedPage ? asset.sourceAssetId : undefined,
    sourceFingerprint: sourceBackedPage ? asset.sourceFingerprint : undefined,
    sourceIssue: undefined,
    sourceIssueIgnoredFingerprint: undefined,
    sourceMissingIgnored: undefined,
    sourcePageNumber: sourceBackedPage ? asset.sourcePageNumber : undefined,
    thumbnailUrl: undefined,
    url: attachment.url,
  };
}

export function documentAttachmentToPromotedCanvasAsset(
  attachment: BlablaHostDocumentAttachment,
  size: { height: number; width: number },
): PromotedCanvasAssetInput {
  return {
    byteSize: attachment.byteSize,
    height: size.height,
    id: `canvas-asset-${crypto.randomUUID()}`,
    jsonCanvasFile: attachment.file,
    kind: "image",
    mime: attachment.mime,
    name: attachment.name,
    url: attachment.url,
    width: size.width,
  };
}
