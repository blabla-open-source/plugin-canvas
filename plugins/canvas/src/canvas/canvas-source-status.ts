import { isResolvedCanvasSourceBackedPageAttachment } from "./canvas-document-attachment";
import type { CanvasAsset, CanvasScene } from "./types";

export type CanvasAssetSourceStatus =
  | "changed"
  | "current"
  | "missing"
  | "unsupported"
  | "unknown";

export interface CanvasSourceIssueMarker {
  assetId: string;
  currentFingerprint?: string;
  message?: string;
  nodeId: string;
  sourceAssetId: string;
  status: Extract<
    CanvasAssetSourceStatus,
    "changed" | "missing" | "unsupported"
  >;
}

export interface CanvasSourceReference {
  id: string;
  missing?: boolean;
  sourceFingerprint?: string;
}

export interface CanvasResolvedSourceIssue {
  currentFingerprint?: string;
  status: CanvasSourceIssueMarker["status"];
}

export type CanvasAssetSourceIssue = CanvasResolvedSourceIssue;

export function resolveCanvasAssetSourceStatuses(
  scene: CanvasScene,
  references: readonly CanvasSourceReference[]
): Record<string, CanvasAssetSourceStatus> {
  const referencesById = new Map(
    references.map((reference) => [reference.id, reference])
  );
  const statuses: Record<string, CanvasAssetSourceStatus> = {};

  for (const asset of Object.values(scene.assets)) {
    statuses[asset.id] = resolveCanvasAssetSourceStatus(
      asset,
      asset.sourceAssetId ? referencesById.get(asset.sourceAssetId) : undefined
    );
  }

  return statuses;
}

export function resolveCanvasSourceIssueMarkers(
  scene: CanvasScene,
  references: readonly CanvasSourceReference[]
): CanvasSourceIssueMarker[] {
  const referencesById = new Map(
    references.map((reference) => [reference.id, reference])
  );
  const statuses = resolveCanvasAssetSourceStatuses(scene, references);

  return scene.nodes.flatMap((node) => {
    const asset = scene.assets[node.assetId];
    const status = statuses[node.assetId];
    return isCanvasSourceIssueStatus(status) && asset?.sourceAssetId
      ? [
          {
            assetId: asset.id,
            currentFingerprint:
              status === "changed"
                ? referencesById.get(asset.sourceAssetId)?.sourceFingerprint
                : undefined,
            nodeId: node.id,
            sourceAssetId: asset.sourceAssetId,
            status
          }
        ]
      : [];
  });
}

export function resolveCanvasEmbeddedSourceIssueMarkers(
  scene: CanvasScene
): CanvasSourceIssueMarker[] {
  return scene.nodes.flatMap((node) => {
    const asset = scene.assets[node.assetId];
    const issue = asset?.sourceIssue;
    if (!(asset && issue)) {
      return [];
    }

    return [
      {
        assetId: asset.id,
        currentFingerprint:
          issue.code === "stale-source" ? asset.sourceFingerprint : undefined,
        message: issue.message,
        nodeId: node.id,
        sourceAssetId: asset.sourceAssetId ?? asset.id,
        status: embeddedSourceIssueStatus(issue.code)
      }
    ];
  });
}

export function applyCanvasSourceSnapshotFallbacks(
  scene: CanvasScene,
  references: readonly CanvasSourceReference[]
): CanvasScene {
  const referencesById = new Map(
    references.map((reference) => [reference.id, reference])
  );
  let nextAssets = scene.assets;

  for (const asset of Object.values(scene.assets)) {
    const reference = asset.sourceAssetId
      ? referencesById.get(asset.sourceAssetId)
      : undefined;
    const runtimeUrl = canvasRuntimeVisualUrl(asset, reference);
    const runtimeMediaUrl = canvasRuntimeMediaUrl(asset, reference);

    if (asset.url === runtimeUrl && asset.mediaUrl === runtimeMediaUrl) {
      continue;
    }

    if (nextAssets === scene.assets) {
      nextAssets = { ...scene.assets };
    }
    nextAssets[asset.id] = {
      ...asset,
      mediaUrl: runtimeMediaUrl,
      url: runtimeUrl
    };
  }

  return nextAssets === scene.assets
    ? scene
    : {
        ...scene,
        assets: nextAssets
      };
}

export function resolveCanvasAssetSourceStatus(
  asset: CanvasAsset,
  reference: CanvasSourceReference | undefined
): CanvasAssetSourceStatus {
  if (isResolvedCanvasSourceBackedPageAttachment(asset) && (!reference || reference.missing)) {
    return "current";
  }

  if (!(asset.sourceAssetId && asset.sourceFingerprint)) {
    return "current";
  }

  if (!reference) {
    return "unknown";
  }

  if (reference.missing) {
    return asset.sourceMissingIgnored ? "current" : "missing";
  }

  if (!reference.sourceFingerprint) {
    return "unknown";
  }

  if (reference.sourceFingerprint === asset.sourceFingerprint) {
    return "current";
  }

  return reference.sourceFingerprint === asset.sourceIssueIgnoredFingerprint
    ? "current"
    : "changed";
}

export function resolveCanvasAssetSourceIssue(
  asset: CanvasAsset,
  reference: CanvasSourceReference | undefined
): CanvasResolvedSourceIssue | null {
  const status = resolveCanvasAssetSourceStatus(asset, reference);
  return isCanvasReferenceSourceIssueStatus(status)
    ? {
        currentFingerprint:
          status === "changed" ? reference?.sourceFingerprint : undefined,
        status
      }
    : resolveCanvasEmbeddedAssetSourceIssue(asset);
}

export function resolveCanvasEmbeddedAssetSourceIssue(
  asset: CanvasAsset
): CanvasResolvedSourceIssue | null {
  const issue = asset.sourceIssue;
  if (!issue) {
    return null;
  }

  const status = embeddedSourceIssueStatus(issue.code);
  return status === "unsupported"
    ? null
    : {
        currentFingerprint:
          status === "changed" ? asset.sourceFingerprint : undefined,
        status
      };
}

function canvasRuntimeVisualUrl(
  asset: CanvasAsset,
  reference: CanvasSourceReference | undefined
): string | undefined {
  if (asset.kind === "image") {
    return canvasRuntimeImageVisualUrl(asset, reference);
  }

  if (!asset.snapshotUrl) {
    return asset.url;
  }

  if (isPreviewBackedCanvasAsset(asset)) {
    return asset.snapshotUrl;
  }

  if (!(asset.sourceAssetId && asset.sourceFingerprint)) {
    return asset.url;
  }

  if (!reference) {
    return asset.url;
  }

  if (reference.missing) {
    return asset.snapshotUrl;
  }

  return reference.sourceFingerprint &&
    reference.sourceFingerprint !== asset.sourceFingerprint
    ? asset.snapshotUrl
    : asset.url;
}

function canvasRuntimeImageVisualUrl(
  asset: CanvasAsset,
  reference: CanvasSourceReference | undefined
): string | undefined {
  if (asset.sourcePageNumber !== undefined) {
    return asset.snapshotUrl ?? asset.url;
  }

  if (!(asset.sourceAssetId && asset.sourceFingerprint)) {
    return asset.snapshotUrl ?? asset.url;
  }

  if (
    reference?.missing ||
    reference?.sourceFingerprint !== asset.sourceFingerprint
  ) {
    return asset.snapshotUrl ?? asset.url;
  }

  return assetSourceUrl({
    assetId: asset.sourceAssetId,
    fingerprint: asset.sourceFingerprint
  });
}

function canvasRuntimeMediaUrl(
  asset: CanvasAsset,
  reference: CanvasSourceReference | undefined
): string | undefined {
  if (
    asset.remoteVideo ||
    !(asset.kind === "video" || asset.kind === "model")
  ) {
    return isCanvasAssetUrl(asset.mediaUrl) ? asset.mediaUrl : undefined;
  }

  if (!(asset.sourceAssetId && asset.sourceFingerprint)) {
    return isCanvasAssetUrl(asset.mediaUrl) ? asset.mediaUrl : undefined;
  }

  if (
    reference?.missing ||
    reference?.sourceFingerprint !== asset.sourceFingerprint
  ) {
    return undefined;
  }

  return assetSourceUrl({
    assetId: asset.sourceAssetId,
    fingerprint: asset.sourceFingerprint
  });
}

function isPreviewBackedCanvasAsset(asset: CanvasAsset): boolean {
  return (
    asset.kind === "image" ||
    asset.kind === "video" ||
    asset.kind === "pdf" ||
    asset.kind === "presentation" ||
    asset.kind === "model"
  );
}

function isCanvasAssetUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "app-file:" && url.hostname === "canvas-asset";
  } catch {
    return false;
  }
}

function assetSourceUrl({
  assetId,
  fingerprint
}: {
  assetId: string;
  fingerprint?: string;
}): string {
  const params = new URLSearchParams({ assetId });
  if (fingerprint) {
    params.set("fingerprint", fingerprint);
  }
  return `app-file://asset-source/file?${params.toString()}`;
}

function isCanvasSourceIssueStatus(
  status: CanvasAssetSourceStatus | undefined
): status is CanvasSourceIssueMarker["status"] {
  return (
    status === "changed" || status === "missing" || status === "unsupported"
  );
}

function isCanvasReferenceSourceIssueStatus(
  status: CanvasAssetSourceStatus | undefined
): status is CanvasResolvedSourceIssue["status"] {
  return status === "changed" || status === "missing";
}

function embeddedSourceIssueStatus(
  code: NonNullable<CanvasAsset["sourceIssue"]>["code"]
): CanvasSourceIssueMarker["status"] {
  if (code === "stale-source") {
    return "changed";
  }

  if (code === "missing-source") {
    return "missing";
  }

  return "unsupported";
}
