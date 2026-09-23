import {
  DEFAULT_VISUAL_CARD_SIZE,
  displaySizeForPromotedAsset
} from "./canvas-promoted-asset-display-size";
import type {
  CanvasAsset,
  CanvasGroup,
  CanvasNode,
  CanvasPoint,
  CanvasRemoteVideo,
  CanvasScene,
  CanvasTextObstacle
} from "./types";

const CANVAS_ASSET_GRID_GAP = 32;

export interface PromotedCanvasAssetInput {
  acceptedTextSnapshot?: string;
  byteSize?: number;
  height: number;
  id: string;
  jsonCanvasFile?: string;
  kind: CanvasAsset["kind"];
  mediaUrl?: string;
  mime: string;
  name: string;
  pageCount?: number;
  remoteVideo?: CanvasRemoteVideo;
  runtimeOnly?: boolean;
  snapshotUrl?: string;
  sourceAssetId?: string;
  sourceFingerprint?: string;
  sourcePageNumber?: number;
  url?: string;
  textObstacle?: CanvasTextObstacle;
  width: number;
}

export function createNodesFromPromotedCanvasAssets(
  promotedAssets: PromotedCanvasAssetInput[],
  point: CanvasPoint,
  startZ: number
): CanvasScene {
  const assets: Record<string, CanvasAsset> = {};
  const groups: Record<string, CanvasGroup> = {};
  const nodes: CanvasNode[] = [];
  const displaySizes = promotedAssets.map((promotedAsset) =>
    displaySizeForPromotedAsset(promotedAsset)
  );
  const positions = layoutDisplaySizesInGrid(
    displaySizes,
    point,
    CANVAS_ASSET_GRID_GAP
  );

  for (const [index, promotedAsset] of promotedAssets.entries()) {
    const displaySize = displaySizes[index] ?? DEFAULT_VISUAL_CARD_SIZE;
    const position = positions[index] ?? point;
    const id = crypto.randomUUID();

    assets[promotedAsset.id] = canvasAssetFromPromotedAsset(
      promotedAsset,
      displaySize
    );
    nodes.push({
      assetId: promotedAsset.id,
      height: displaySize.height,
      id,
      rotation: 0,
      width: displaySize.width,
      x: position.x,
      y: position.y,
      z: startZ + index
    });
  }

  return { assets, groups, nodes };
}

export const mergeScene = (
  scene: CanvasScene,
  patch: CanvasScene
): CanvasScene => ({
  assets: { ...scene.assets, ...patch.assets },
  edges: patch.edges ? [...(scene.edges ?? []), ...patch.edges] : scene.edges,
  groups: { ...scene.groups, ...patch.groups },
  nodes: [...scene.nodes, ...patch.nodes]
});

export function updatePromotedCanvasAssetPreview(
  scene: CanvasScene,
  promotedAsset: PromotedCanvasAssetInput
): CanvasScene {
  const previousAsset = scene.assets[promotedAsset.id];

  if (!previousAsset) {
    return scene;
  }

  const displaySize = displaySizeForPromotedAsset(promotedAsset);
  const nextAsset = preserveCanvasSourceIssueAcknowledgement(
    previousAsset,
    canvasAssetFromPromotedAsset(promotedAsset, displaySize)
  );
  const nodes = scene.nodes.map((node) => {
    if (node.assetId !== promotedAsset.id) {
      return node;
    }

    if (
      node.width !== previousAsset.width ||
      node.height !== previousAsset.height
    ) {
      return node;
    }

    return {
      ...node,
      height: displaySize.height,
      width: displaySize.width
    };
  });

  return {
    ...scene,
    assets: {
      ...scene.assets,
      [promotedAsset.id]: nextAsset
    },
    nodes
  };
}

export function refreshPromotedCanvasAssetPreview(
  scene: CanvasScene,
  promotedAsset: PromotedCanvasAssetInput
): CanvasScene {
  const previousAsset = scene.assets[promotedAsset.id];
  if (!previousAsset) {
    return scene;
  }

  if (
    previousAsset.sourceFingerprint &&
    promotedAsset.sourceFingerprint &&
    previousAsset.sourceFingerprint !== promotedAsset.sourceFingerprint
  ) {
    return scene;
  }

  return updatePromotedCanvasAssetPreview(scene, promotedAsset);
}

export function canvasAssetFromPromotedAsset(
  promotedAsset: PromotedCanvasAssetInput,
  displaySize: { height: number; width: number }
): CanvasAsset {
  const mediaUrl = durableCanvasAssetUrl(promotedAsset.mediaUrl);
  const snapshotUrl = durableCanvasAssetUrl(promotedAsset.snapshotUrl);
  const url = snapshotUrl ?? durableCanvasAssetUrl(promotedAsset.url);

  return {
    ...displaySize,
    acceptedTextSnapshot: promotedAsset.acceptedTextSnapshot,
    byteSize: promotedAsset.byteSize,
      id: promotedAsset.id,
      jsonCanvasFile: promotedAsset.jsonCanvasFile,
      kind: promotedAsset.kind,
    mediaUrl,
    mime: promotedAsset.mime,
    name: promotedAsset.name,
    pageCount: promotedAsset.pageCount,
    remoteVideo: promotedAsset.remoteVideo,
    runtimeOnly: promotedAsset.runtimeOnly,
    sourceAssetId: promotedAsset.sourceAssetId,
    sourceFingerprint: promotedAsset.sourceFingerprint,
    sourcePageNumber: promotedAsset.sourcePageNumber,
    textObstacle: promotedAsset.textObstacle,
    snapshotUrl,
    url
  };
}

function preserveCanvasSourceIssueAcknowledgement(
  previousAsset: CanvasAsset,
  nextAsset: CanvasAsset
): CanvasAsset {
  const preservedJsonCanvasAsset = {
    ...nextAsset,
    jsonCanvasBackground: previousAsset.jsonCanvasBackground,
    jsonCanvasBackgroundStyle: previousAsset.jsonCanvasBackgroundStyle,
    jsonCanvasColor: previousAsset.jsonCanvasColor,
    jsonCanvasFile: previousAsset.jsonCanvasFile,
    jsonCanvasLabel: previousAsset.jsonCanvasLabel,
    jsonCanvasNodeType: previousAsset.jsonCanvasNodeType,
    jsonCanvasSubpath: previousAsset.jsonCanvasSubpath,
    jsonCanvasUrl: previousAsset.jsonCanvasUrl
  };

  if (previousAsset.sourceFingerprint !== nextAsset.sourceFingerprint) {
    return preservedJsonCanvasAsset;
  }

  return {
    ...preservedJsonCanvasAsset,
    sourceIssueIgnoredFingerprint: previousAsset.sourceIssueIgnoredFingerprint,
    sourceMissingIgnored: previousAsset.sourceMissingIgnored
  };
}

function durableCanvasAssetUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "app-file:") {
      return value;
    }

    return [
      "asset-source",
      "canvas-asset",
      "derivative",
      "document-attachment",
      "material",
      "page-snapshot"
    ].includes(url.hostname)
      ? value
      : undefined;
  } catch {
    return value;
  }
}

function layoutDisplaySizesInGrid(
  displaySizes: readonly { height: number; width: number }[],
  point: CanvasPoint,
  gap: number
): CanvasPoint[] {
  if (displaySizes.length === 0) {
    return [];
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(displaySizes.length)));
  const positions: CanvasPoint[] = [];
  let y = point.y;

  for (let rowStart = 0; rowStart < displaySizes.length; rowStart += columns) {
    const row = displaySizes.slice(rowStart, rowStart + columns);
    const rowHeight = Math.max(
      1,
      ...row.map((displaySize) => displaySize.height)
    );
    let x = point.x;

    for (const displaySize of row) {
      positions.push({ x: Math.round(x), y: Math.round(y) });
      x += displaySize.width + gap;
    }

    y += rowHeight + gap;
  }

  return positions;
}
