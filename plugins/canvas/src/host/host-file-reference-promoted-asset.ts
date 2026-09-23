import type { PromotedCanvasAssetInput } from "../canvas/canvas-scene-promoted-assets";
import type { CanvasRemoteVideo } from "../canvas/types";
import type { BlablaHostFileReference } from "./host-api";

interface PromotedCanvasAssetOptions {
  assetId?: string;
  byteSize?: number;
  height?: number;
  jsonCanvasFile?: string;
  mime?: string;
  pageNumber?: number;
  pagePreviewUrl?: string;
  width?: number;
}

export function fileReferenceToPromotedCanvasAsset(
  reference: BlablaHostFileReference,
  options: PromotedCanvasAssetOptions = {},
): PromotedCanvasAssetInput {
  const fallbackSize = fileReferenceDisplaySize(reference, options.pageNumber);
  const size = {
    height: options.height ?? fallbackSize.height,
    width: options.width ?? fallbackSize.width,
  };
  const visualUrl =
    options.pagePreviewUrl ??
    reference.largePreviewUrl ??
    reference.previewUrl ??
    reference.remoteVideo?.thumbnailUrl ??
    reference.sourceUrl ??
    undefined;
  const sourceUrl = reference.sourceUrl ?? undefined;

  return {
    acceptedTextSnapshot: textSnapshotForReference(reference),
    byteSize: options.byteSize ?? reference.byteSize,
    height: size.height,
    id: options.assetId ?? `canvas-asset-${crypto.randomUUID()}`,
    jsonCanvasFile: options.jsonCanvasFile ?? reference.sourcePath,
    kind: options.pageNumber ? "image" : reference.kind,
    mediaUrl:
      reference.kind === "model" || reference.kind === "video"
        ? sourceUrl
        : undefined,
    mime: options.mime ?? (options.pageNumber ? "image/webp" : reference.mime),
    name: options.pageNumber
      ? `${reference.name} · ${pageLabel(reference, options.pageNumber)}`
      : reference.name,
    pageCount: options.pageNumber ? undefined : reference.pageCount,
    remoteVideo: remoteVideoForReference(reference),
    snapshotUrl: options.pageNumber
      ? options.pagePreviewUrl
      : reference.previewUrl ?? undefined,
    sourceAssetId: reference.id,
    sourceFingerprint: reference.sourceFingerprint,
    sourcePageNumber: options.pageNumber,
    url: visualUrl,
    width: size.width,
  };
}

function fileReferenceDisplaySize(
  reference: BlablaHostFileReference,
  pageNumber?: number,
): { height: number; width: number } {
  if (pageNumber) {
    return reference.kind === "presentation"
      ? { height: 292, width: 520 }
      : { height: 360, width: 260 };
  }
  if (reference.width && reference.height) {
    return { height: reference.height, width: reference.width };
  }
  if (reference.kind === "video" || reference.kind === "model") {
    return { height: 360, width: 640 };
  }
  if (textSnapshotForReference(reference)) {
    return { height: 360, width: 640 };
  }
  if (reference.kind === "pdf") {
    return { height: 360, width: 260 };
  }
  if (reference.kind === "presentation") {
    return { height: 292, width: 520 };
  }
  return { height: 220, width: 320 };
}

function remoteVideoForReference(
  reference: BlablaHostFileReference,
): CanvasRemoteVideo | undefined {
  if (!(reference.sourceKind === "remote-video" && reference.remoteVideo)) {
    return undefined;
  }
  return {
    embedUrl: reference.remoteVideo.url,
    provider: canvasExternalResourceProvider(reference.remoteVideo.provider),
    thumbnailUrl: reference.remoteVideo.thumbnailUrl,
    title: reference.remoteVideo.title,
    url: reference.remoteVideo.url,
  };
}

function canvasExternalResourceProvider(
  provider: string | undefined,
): CanvasRemoteVideo["provider"] {
  return provider === "bilibili" || provider === "vimeo" || provider === "youtube"
    ? provider
    : "generic";
}

function textSnapshotForReference(
  reference: BlablaHostFileReference,
): string | undefined {
  return reference.mime.startsWith("text/") ||
    reference.mime === "application/json" ||
    reference.mime === "application/xml"
    ? reference.contentPreview
    : undefined;
}

function pageLabel(
  reference: BlablaHostFileReference,
  pageNumber: number,
): string {
  return reference.kind === "presentation"
    ? `Slide ${pageNumber}`
    : `Page ${pageNumber}`;
}
