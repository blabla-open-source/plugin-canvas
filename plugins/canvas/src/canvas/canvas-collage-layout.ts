import { isPreviewBackedAsset } from "./canvas-asset-rendering";
import {
  boundsForRects,
  type CanvasCollageRect,
  insetFrame,
  normalizeRotation,
  rotatedRectBounds,
  rotatePoint,
  sizeFrame
} from "./canvas-collage-geometry";
import { packCanvasCollageItems } from "./canvas-collage-packing";
import { isTextDocumentAsset } from "./canvas-text-document-model";
import type { CanvasNode, CanvasScene } from "./types";

export type CanvasCollageCandidateKind = "image" | "text" | "file";

export type { CanvasCollageRect } from "./canvas-collage-geometry";

export interface CanvasCollageCandidate {
  area: number;
  assetId: string;
  bounds: CanvasCollageRect;
  index: number;
  kind: CanvasCollageCandidateKind;
  nodeId: string;
  rotation: number;
  source: CanvasCollageRect;
  z: number;
}

export interface CanvasCollagePlacement {
  candidate: CanvasCollageCandidate;
  contentFrame: CanvasCollageRect;
  frame: CanvasCollageRect;
}

export interface CanvasCollageLayout {
  contentFrame: CanvasCollageRect;
  placements: readonly CanvasCollagePlacement[];
  scale: number;
  size: {
    height: number;
    width: number;
  };
}

const MAX_COLLAGE_CANDIDATES = 128;
const MIN_SOURCE_SIZE = 1;
const VISIBLE_PADDING_RATIO = 0.025;
const ANCHOR_ITEM_LIMIT = 5;
const ANCHOR_AREA_RATIO = 0.18;
const SUPPORT_AREA_RATIO = 0.02;
const MAX_SUPPORT_ITEMS = 28;
const MAX_ACCENT_ITEMS = 12;
const AREA_TIE_RATIO = 0.08;

export function createCanvasCollageLayout({
  scene,
  size
}: {
  scene: CanvasScene;
  size: { height: number; width: number };
}): CanvasCollageLayout {
  const viewportFrame = sizeFrame(size);
  const contentFrame = insetFrame(viewportFrame, visiblePadding(size));
  const candidates = selectCoverCandidates(
    collectCandidates(scene).slice(0, MAX_COLLAGE_CANDIDATES)
  );
  if (candidates.length === 0) {
    return {
      contentFrame,
      placements: [],
      scale: 1,
      size
    };
  }

  const packedLayout = packCanvasCollageItems(
    candidates.map((candidate) => ({
      bounds: candidate.bounds,
      item: candidate,
      source: candidate.source
    })),
    contentFrame
  );
  const placements = packedLayout.placements.map((placement) => ({
    candidate: placement.item,
    contentFrame: placement.contentFrame,
    frame: placement.frame
  }));

  return {
    contentFrame,
    placements: placements.sort(comparePlacementsForDrawing),
    scale: packedLayout.scale,
    size
  };
}

export function collectCanvasCollageCandidates(
  scene: CanvasScene
): readonly CanvasCollageCandidate[] {
  return collectCandidates(scene);
}

export function canvasCollagePackedContentBounds(
  scene: CanvasScene
): CanvasCollageRect | null {
  const candidates = selectCoverCandidates(
    collectCandidates(scene).slice(0, MAX_COLLAGE_CANDIDATES)
  );
  if (candidates.length === 0) {
    return null;
  }

  const packedLayout = packCanvasCollageItems(
    candidates.map((candidate) => ({
      bounds: candidate.bounds,
      item: candidate,
      source: candidate.source
    })),
    sizeFrame({ height: 1000, width: 1000 })
  );
  return boundsForRects(
    packedLayout.placements.map((placement) => placement.frame)
  );
}

function collectCandidates(scene: CanvasScene): CanvasCollageCandidate[] {
  return scene.nodes
    .map((node, index) => collageCandidate(scene, node, index))
    .filter((candidate): candidate is CanvasCollageCandidate =>
      Boolean(candidate)
    )
    .sort(compareCandidates);
}

function selectCoverCandidates(
  candidates: readonly CanvasCollageCandidate[]
): CanvasCollageCandidate[] {
  const first = candidates[0];
  if (!first) {
    return [];
  }

  const anchors: CanvasCollageCandidate[] = [];
  let index = 0;
  while (index < candidates.length && anchors.length < ANCHOR_ITEM_LIMIT) {
    const candidate = candidates[index];
    if (!candidate) {
      break;
    }

    if (anchors.length > 0 && candidate.area / first.area < ANCHOR_AREA_RATIO) {
      break;
    }
    anchors.push(candidate);
    index += 1;
  }

  const support: CanvasCollageCandidate[] = [];
  while (index < candidates.length && support.length < MAX_SUPPORT_ITEMS) {
    const candidate = candidates[index];
    if (!candidate) {
      break;
    }

    if (candidate.area / first.area < SUPPORT_AREA_RATIO) {
      break;
    }
    support.push(candidate);
    index += 1;
  }

  const accents = candidates.slice(index, index + MAX_ACCENT_ITEMS);
  return [...anchors, ...support, ...accents];
}

function collageCandidate(
  scene: CanvasScene,
  node: CanvasNode,
  index: number
): CanvasCollageCandidate | null {
  const asset = scene.assets[node.assetId];
  if (!asset) {
    return null;
  }

  const source = absoluteNodeRect(scene, node);
  if (
    source.width < MIN_SOURCE_SIZE ||
    source.height < MIN_SOURCE_SIZE ||
    !Number.isFinite(source.x) ||
    !Number.isFinite(source.y)
  ) {
    return null;
  }

  let kind: CanvasCollageCandidateKind;
  if (isTextDocumentAsset(asset)) {
    kind = "text";
  } else if (isPreviewBackedAsset(asset) && asset.url) {
    kind = "image";
  } else {
    kind = "file";
  }

  return {
    area: source.width * source.height,
    assetId: node.assetId,
    bounds: rotatedRectBounds(source, source.rotation),
    index,
    kind,
    nodeId: node.id,
    rotation: source.rotation,
    source,
    z: node.z
  };
}

function absoluteNodeRect(
  scene: CanvasScene,
  node: CanvasNode
): CanvasCollageRect & { rotation: number } {
  const group = node.groupId ? scene.groups[node.groupId] : null;
  const center = group
    ? rotatePoint(
        {
          x: group.x + node.x + node.width / 2,
          y: group.y + node.y + node.height / 2
        },
        {
          x: group.x + group.width / 2,
          y: group.y + group.height / 2
        },
        group.rotation
      )
    : {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2
      };

  return {
    height: node.height,
    rotation: normalizeRotation((group?.rotation ?? 0) + node.rotation),
    width: node.width,
    x: center.x - node.width / 2,
    y: center.y - node.height / 2
  };
}

function compareCandidates(
  left: CanvasCollageCandidate,
  right: CanvasCollageCandidate
): number {
  const areaDelta = right.area - left.area;
  const tieBasis = Math.max(left.area, right.area);
  if (Math.abs(areaDelta) > tieBasis * AREA_TIE_RATIO) {
    return areaDelta;
  }

  return (
    candidateKindRank(left.kind) - candidateKindRank(right.kind) ||
    areaDelta ||
    right.z - left.z ||
    left.index - right.index
  );
}

function comparePlacementsForDrawing(
  left: CanvasCollagePlacement,
  right: CanvasCollagePlacement
): number {
  return (
    left.candidate.z - right.candidate.z ||
    left.candidate.index - right.candidate.index
  );
}

function candidateKindRank(kind: CanvasCollageCandidateKind): number {
  if (kind === "image") {
    return 0;
  }
  if (kind === "text") {
    return 1;
  }
  return 2;
}

function visiblePadding(size: { height: number; width: number }): number {
  return Math.min(size.height, size.width) * VISIBLE_PADDING_RATIO;
}
