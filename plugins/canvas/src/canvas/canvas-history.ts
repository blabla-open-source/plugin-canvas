import type {
  CanvasAsset,
  CanvasGroup,
  CanvasNode,
  CanvasRemoteVideo,
  CanvasScene
} from "./types";

const HISTORY_LIMIT = 100;

interface CanvasValueChange<T> {
  after: T | null;
  before: T | null;
}

export interface CanvasSceneHistoryEntry {
  assets: Record<string, CanvasValueChange<CanvasAsset>>;
  groups: Record<string, CanvasValueChange<CanvasGroup>>;
  nodeOrderAfter: string[];
  nodeOrderBefore: string[];
  nodes: Record<string, CanvasValueChange<CanvasNode>>;
}

export interface CanvasSceneHistoryCapture {
  before: CanvasScene;
  id: string;
}

export interface CanvasSceneHistory {
  capture: CanvasSceneHistoryCapture | null;
  redos: CanvasSceneHistoryEntry[];
  undos: CanvasSceneHistoryEntry[];
}

export type CanvasSceneHistoryState = CanvasSceneHistory;

export interface CanvasSceneHistoryResult {
  history: CanvasSceneHistory;
  scene: CanvasScene;
}

export function emptyCanvasSceneHistory(): CanvasSceneHistory {
  return {
    capture: null,
    redos: [],
    undos: []
  };
}

export function beginCanvasSceneHistoryCapture(
  history: CanvasSceneHistory,
  id: string,
  scene: CanvasScene
): CanvasSceneHistory {
  if (history.capture?.id === id) {
    return history;
  }

  return {
    ...commitCanvasSceneHistoryCapture(history, scene),
    capture: { before: scene, id }
  };
}

export function commitCanvasSceneHistoryCapture(
  history: CanvasSceneHistory,
  scene: CanvasScene
): CanvasSceneHistory {
  if (!history.capture) {
    return history;
  }

  const entry = createCanvasSceneHistoryEntry(history.capture.before, scene);
  if (!entry) {
    return { ...history, capture: null };
  }

  return pushCanvasSceneHistoryEntry(
    {
      ...history,
      capture: null
    },
    entry
  );
}

export function captureCanvasSceneChange(
  history: CanvasSceneHistory,
  before: CanvasScene,
  after: CanvasScene
): CanvasSceneHistory {
  const committed = commitCanvasSceneHistoryCapture(history, before);
  const entry = createCanvasSceneHistoryEntry(before, after);

  if (!entry) {
    return committed;
  }

  return pushCanvasSceneHistoryEntry(committed, entry);
}

export function undoCanvasSceneChange(
  scene: CanvasScene,
  history: CanvasSceneHistory
): CanvasSceneHistoryResult {
  const committed = commitCanvasSceneHistoryCapture(history, scene);
  const entry = committed.undos.at(-1);

  if (!entry) {
    return { history: committed, scene };
  }

  return {
    history: {
      capture: null,
      redos: [...committed.redos, entry].slice(-HISTORY_LIMIT),
      undos: committed.undos.slice(0, -1)
    },
    scene: applyCanvasSceneHistoryEntry(scene, entry, "undo")
  };
}

export function redoCanvasSceneChange(
  scene: CanvasScene,
  history: CanvasSceneHistory
): CanvasSceneHistoryResult {
  const committed = commitCanvasSceneHistoryCapture(history, scene);
  const entry = committed.redos.at(-1);

  if (!entry) {
    return { history: committed, scene };
  }

  return {
    history: {
      capture: null,
      redos: committed.redos.slice(0, -1),
      undos: [...committed.undos, entry].slice(-HISTORY_LIMIT)
    },
    scene: applyCanvasSceneHistoryEntry(scene, entry, "redo")
  };
}

export function undoCanvasSceneHistory(
  history: CanvasSceneHistory,
  scene: CanvasScene
): CanvasSceneHistoryResult | null {
  const result = undoCanvasSceneChange(scene, history);
  return result.history === history && result.scene === scene ? null : result;
}

export function redoCanvasSceneHistory(
  history: CanvasSceneHistory,
  scene: CanvasScene
): CanvasSceneHistoryResult | null {
  const result = redoCanvasSceneChange(scene, history);
  return result.history === history && result.scene === scene ? null : result;
}

export function canUndoCanvasSceneChange(history: CanvasSceneHistory): boolean {
  return history.undos.length > 0;
}

export function canRedoCanvasSceneChange(history: CanvasSceneHistory): boolean {
  return history.redos.length > 0;
}

export function createCanvasSceneHistoryEntry(
  before: CanvasScene,
  after: CanvasScene
): CanvasSceneHistoryEntry | null {
  const entry: CanvasSceneHistoryEntry = {
    assets: diffRecords(before.assets, after.assets, sameCanvasAsset),
    groups: diffRecords(before.groups, after.groups, sameCanvasGroup),
    nodeOrderAfter: after.nodes.map((node) => node.id),
    nodeOrderBefore: before.nodes.map((node) => node.id),
    nodes: diffRecords(
      nodesById(before.nodes),
      nodesById(after.nodes),
      sameCanvasNode
    )
  };

  return isEmptyCanvasSceneHistoryEntry(entry) ? null : entry;
}

export function isSameCanvasScene(
  before: CanvasScene,
  after: CanvasScene
): boolean {
  return createCanvasSceneHistoryEntry(before, after) === null;
}

export function pushCanvasSceneHistoryEntry(
  history: CanvasSceneHistory,
  entry: CanvasSceneHistoryEntry
): CanvasSceneHistory {
  return {
    capture: null,
    redos: [],
    undos: [...history.undos, entry].slice(-HISTORY_LIMIT)
  };
}

function applyCanvasSceneHistoryEntry(
  scene: CanvasScene,
  entry: CanvasSceneHistoryEntry,
  direction: "redo" | "undo"
): CanvasScene {
  const useAfter = direction === "redo";

  return {
    ...scene,
    assets: applyRecordChanges(scene.assets, entry.assets, useAfter),
    groups: applyRecordChanges(scene.groups, entry.groups, useAfter),
    nodes: applyNodeChanges(scene.nodes, entry, useAfter)
  };
}

function applyRecordChanges<T>(
  records: Record<string, T>,
  changes: Record<string, CanvasValueChange<T>>,
  useAfter: boolean
): Record<string, T> {
  const next = { ...records };

  for (const [id, change] of Object.entries(changes)) {
    const value = useAfter ? change.after : change.before;

    if (value) {
      next[id] = value;
    } else {
      delete next[id];
    }
  }

  return next;
}

function applyNodeChanges(
  nodes: CanvasNode[],
  entry: CanvasSceneHistoryEntry,
  useAfter: boolean
): CanvasNode[] {
  const nextNodes = new Map(nodes.map((node) => [node.id, node]));

  for (const [id, change] of Object.entries(entry.nodes)) {
    const value = useAfter ? change.after : change.before;

    if (value) {
      nextNodes.set(id, value);
    } else {
      nextNodes.delete(id);
    }
  }

  return orderNodesByIds(
    nextNodes,
    useAfter ? entry.nodeOrderAfter : entry.nodeOrderBefore
  );
}

function orderNodesByIds(
  nodes: Map<string, CanvasNode>,
  orderedIds: readonly string[]
): CanvasNode[] {
  const usedIds = new Set<string>();
  const orderedNodes: CanvasNode[] = [];

  for (const id of orderedIds) {
    const node = nodes.get(id);
    if (node) {
      orderedNodes.push(node);
      usedIds.add(id);
    }
  }

  for (const node of nodes.values()) {
    if (!usedIds.has(node.id)) {
      orderedNodes.push(node);
    }
  }

  return orderedNodes;
}

function diffRecords<T>(
  before: Record<string, T>,
  after: Record<string, T>,
  equals: (left: T, right: T) => boolean
): Record<string, CanvasValueChange<T>> {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Record<string, CanvasValueChange<T>> = {};

  for (const id of ids) {
    const beforeValue = before[id] ?? null;
    const afterValue = after[id] ?? null;

    if (beforeValue && afterValue && equals(beforeValue, afterValue)) {
      continue;
    }

    changes[id] = {
      after: afterValue,
      before: beforeValue
    };
  }

  return changes;
}

function nodesById(nodes: readonly CanvasNode[]): Record<string, CanvasNode> {
  return Object.fromEntries(nodes.map((node) => [node.id, node]));
}

function isEmptyCanvasSceneHistoryEntry(
  entry: CanvasSceneHistoryEntry
): boolean {
  return (
    Object.keys(entry.assets).length === 0 &&
    Object.keys(entry.groups).length === 0 &&
    Object.keys(entry.nodes).length === 0 &&
    sameStringList(entry.nodeOrderBefore, entry.nodeOrderAfter)
  );
}

function sameCanvasAsset(left: CanvasAsset, right: CanvasAsset): boolean {
  return (
    left.acceptedTextSnapshot === right.acceptedTextSnapshot &&
    left.aspectRatio === right.aspectRatio &&
    left.byteSize === right.byteSize &&
    left.createdAt === right.createdAt &&
    left.height === right.height &&
    left.id === right.id &&
    left.jsonCanvasBackground === right.jsonCanvasBackground &&
    left.jsonCanvasBackgroundStyle === right.jsonCanvasBackgroundStyle &&
    left.jsonCanvasColor === right.jsonCanvasColor &&
    left.jsonCanvasFile === right.jsonCanvasFile &&
    left.jsonCanvasLabel === right.jsonCanvasLabel &&
    left.jsonCanvasNodeType === right.jsonCanvasNodeType &&
    left.jsonCanvasSubpath === right.jsonCanvasSubpath &&
    left.jsonCanvasUrl === right.jsonCanvasUrl &&
    left.kind === right.kind &&
    left.mediaUrl === right.mediaUrl &&
    left.mime === right.mime &&
    left.name === right.name &&
    left.pageCount === right.pageCount &&
    sameCanvasRemoteVideo(left.remoteVideo, right.remoteVideo) &&
    left.snapshotUrl === right.snapshotUrl &&
    left.sourceAssetId === right.sourceAssetId &&
    left.sourceFingerprint === right.sourceFingerprint &&
    sameCanvasSourceIssue(left.sourceIssue, right.sourceIssue) &&
    left.sourceIssueIgnoredFingerprint ===
      right.sourceIssueIgnoredFingerprint &&
    left.sourceMissingIgnored === right.sourceMissingIgnored &&
    left.sourcePageNumber === right.sourcePageNumber &&
    left.textContent === right.textContent &&
    sameCanvasTextObstacle(left.textObstacle, right.textObstacle) &&
    left.thumbnailUrl === right.thumbnailUrl &&
    left.updatedAt === right.updatedAt &&
    left.url === right.url &&
    left.width === right.width
  );
}

function sameCanvasRemoteVideo(
  left: CanvasRemoteVideo | undefined,
  right: CanvasRemoteVideo | undefined
): boolean {
  if (!(left || right)) {
    return true;
  }

  return (
    Boolean(left && right) &&
    left?.authorName === right?.authorName &&
    left?.authorUrl === right?.authorUrl &&
    left?.canonicalUrl === right?.canonicalUrl &&
    left?.duration === right?.duration &&
    left?.embedUrl === right?.embedUrl &&
    left?.height === right?.height &&
    left?.metadataCapturedAt === right?.metadataCapturedAt &&
    left?.originalUrl === right?.originalUrl &&
    left?.provider === right?.provider &&
    sameStringList(left?.providerTags ?? [], right?.providerTags ?? []) &&
    left?.publishedAt === right?.publishedAt &&
    sameCanvasRemoteVideoStatistics(left?.statistics, right?.statistics) &&
    left?.thumbnailHeight === right?.thumbnailHeight &&
    left?.thumbnailUrl === right?.thumbnailUrl &&
    left?.thumbnailWidth === right?.thumbnailWidth &&
    left?.title === right?.title &&
    left?.url === right?.url &&
    left?.videoId === right?.videoId &&
    left?.width === right?.width
  );
}

function sameCanvasRemoteVideoStatistics(
  left: CanvasRemoteVideo["statistics"],
  right: CanvasRemoteVideo["statistics"]
): boolean {
  if (!(left || right)) {
    return true;
  }

  return (
    Boolean(left && right) &&
    left?.coinCount === right?.coinCount &&
    left?.commentCount === right?.commentCount &&
    left?.favoriteCount === right?.favoriteCount &&
    left?.likeCount === right?.likeCount &&
    left?.shareCount === right?.shareCount &&
    left?.viewCount === right?.viewCount
  );
}

function sameCanvasSourceIssue(
  left: CanvasAsset["sourceIssue"],
  right: CanvasAsset["sourceIssue"]
): boolean {
  if (!(left || right)) {
    return true;
  }

  return (
    Boolean(left && right) &&
    left?.code === right?.code &&
    left?.message === right?.message &&
    left?.observedAt === right?.observedAt
  );
}

function sameCanvasTextObstacle(
  left: CanvasAsset["textObstacle"],
  right: CanvasAsset["textObstacle"]
): boolean {
  if (!(left || right)) {
    return true;
  }

  return (
    Boolean(left && right) &&
    left?.height === right?.height &&
    left?.width === right?.width &&
    left?.x === right?.x &&
    left?.y === right?.y
  );
}

function sameCanvasGroup(left: CanvasGroup, right: CanvasGroup): boolean {
  return (
    left.height === right.height &&
    left.id === right.id &&
    left.rotation === right.rotation &&
    left.sourceAssetId === right.sourceAssetId &&
    left.sourceNodeId === right.sourceNodeId &&
    left.totalItems === right.totalItems &&
    left.type === right.type &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z
  );
}

function sameCanvasNode(left: CanvasNode, right: CanvasNode): boolean {
  return (
    left.assetId === right.assetId &&
    left.groupId === right.groupId &&
    left.height === right.height &&
    left.id === right.id &&
    left.rotation === right.rotation &&
    left.width === right.width &&
    left.x === right.x &&
    left.y === right.y &&
    left.z === right.z
  );
}

function sameStringList(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
