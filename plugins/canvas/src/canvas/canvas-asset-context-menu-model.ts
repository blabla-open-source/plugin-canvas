import type { CanvasSceneReorderOperation } from "./canvas-scene-reorder";
import {
  type CanvasResolvedSourceIssue,
  type CanvasSourceReference,
  resolveCanvasAssetSourceIssue
} from "./canvas-source-status";
import type { CanvasAsset, CanvasNode, CanvasScene } from "./types";

export type CanvasAssetContextMenuAction =
  | "acknowledge-source-issue"
  | "bring-forward"
  | "bring-to-front"
  | "duplicate-node"
  | "open"
  | "open-remote-page"
  | "pause-video"
  | "play-video"
  | "remove-from-canvas"
  | "reveal"
  | "send-backward"
  | "send-to-back"
  | "sync-source";

export interface CanvasAssetContextReference extends CanvasSourceReference {
  remoteVideo?: { provider?: string; url?: string } | null;
  sourceKind?: "file" | "model" | "remote-video" | "url" | string;
}

export interface CanvasAssetContextMenuActionEntry {
  action: CanvasAssetContextMenuAction;
  labelKey?: string;
  type: "action";
  variant?: "destructive";
}

export interface CanvasAssetLayerSubmenuEntry {
  id: "layer";
  type: "layer-submenu";
}

export type CanvasAssetContextMenuEntry =
  | CanvasAssetContextMenuActionEntry
  | CanvasAssetLayerSubmenuEntry;

export interface CanvasAssetContextMenuTargets {
  groupIds: readonly string[];
  nodeIds: readonly string[];
}

export interface CanvasAssetContextMenuSelection {
  singleNodeAsset: { asset: CanvasAsset; node: CanvasNode } | null;
  singleReference: CanvasAssetContextReference | null;
  singleSourceIssue: CanvasResolvedSourceIssue | null;
}

export interface CanvasAssetContextMenuModel {
  entries: CanvasAssetContextMenuEntry[];
  selection: CanvasAssetContextMenuSelection;
}

export const CANVAS_ASSET_LAYER_MENU_ITEMS: {
  action: CanvasAssetContextMenuAction;
  operation: CanvasSceneReorderOperation;
}[] = [
  { action: "bring-to-front", operation: "to-front" },
  { action: "bring-forward", operation: "forward" },
  { action: "send-backward", operation: "backward" },
  { action: "send-to-back", operation: "to-back" }
];

const CANVAS_ASSET_LAYER_MENU_ENTRY: CanvasAssetLayerSubmenuEntry = {
  id: "layer",
  type: "layer-submenu"
};

export function buildCanvasAssetContextMenuModel(
  scene: CanvasScene,
  targets: CanvasAssetContextMenuTargets,
  references: readonly CanvasAssetContextReference[] = [],
  sourceReferences: readonly CanvasSourceReference[] = references,
  isVideoPlaybackActive: (nodeId: string) => boolean = () => false
): CanvasAssetContextMenuModel {
  const selection = resolveCanvasAssetContextMenuSelection(
    scene,
    targets,
    references,
    sourceReferences
  );

  return {
    entries: [
      openReferenceMenuEntry(selection.singleReference),
      videoPlaybackMenuEntry(selection.singleNodeAsset, isVideoPlaybackActive),
      remoteVideoPageMenuEntry(selection.singleReference),
      syncSourceIssueMenuEntry(
        selection.singleNodeAsset,
        selection.singleSourceIssue
      ),
      acknowledgeSourceIssueMenuEntry(selection.singleSourceIssue),
      canvasAssetContextMenuAction("duplicate-node"),
      CANVAS_ASSET_LAYER_MENU_ENTRY,
      revealReferenceMenuEntry(selection.singleReference),
      canvasAssetContextMenuAction("remove-from-canvas", {
        variant: "destructive"
      })
    ].filter(isCanvasAssetContextMenuEntry),
    selection
  };
}

export function canvasAssetContextMenuAction(
  action: CanvasAssetContextMenuAction,
  options: Omit<CanvasAssetContextMenuActionEntry, "action" | "type"> = {}
): CanvasAssetContextMenuActionEntry {
  return {
    action,
    type: "action",
    ...options
  };
}

export function canvasAssetContextMenuEntryKey(
  entry: CanvasAssetContextMenuEntry
): string {
  return entry.type === "layer-submenu" ? entry.id : entry.action;
}

export function groupCanvasAssetContextMenuEntries(
  entries: readonly CanvasAssetContextMenuEntry[]
): CanvasAssetContextMenuEntry[][] {
  const groups: CanvasAssetContextMenuEntry[][] = [[], [], [], []];

  for (const entry of entries) {
    if (entry.type === "layer-submenu") {
      groups[1]?.push(entry);
      continue;
    }

    if (entry.variant === "destructive") {
      groups[3]?.push(entry);
      continue;
    }

    if (entry.action === "duplicate-node") {
      groups[1]?.push(entry);
      continue;
    }

    if (entry.action === "reveal") {
      groups[2]?.push(entry);
      continue;
    }

    groups[0]?.push(entry);
  }

  return groups.filter((group) => group.length > 0);
}

export function canvasAssetContextMenuPosition(event: {
  clientX: number;
  clientY: number;
}): { x: number; y: number } {
  const menuWidth = 208;
  const menuHeight = 248;

  return {
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight))
  };
}

function resolveCanvasAssetContextMenuSelection(
  scene: CanvasScene,
  targets: CanvasAssetContextMenuTargets,
  references: readonly CanvasAssetContextReference[],
  sourceReferences: readonly CanvasSourceReference[]
): CanvasAssetContextMenuSelection {
  const singleNodeAsset = resolveSingleContextNodeAsset(scene, targets);

  return {
    singleNodeAsset,
    singleReference: resolveSingleContextReference(scene, targets, references),
    singleSourceIssue: resolveSingleContextSourceIssue(
      singleNodeAsset,
      sourceReferences
    )
  };
}

function resolveSingleContextReference(
  scene: CanvasScene,
  targets: CanvasAssetContextMenuTargets,
  references: readonly CanvasAssetContextReference[]
): CanvasAssetContextReference | null {
  const sourceReferenceId = singleContextSourceReferenceId(scene, targets);
  return (
    references.find((reference) => reference.id === sourceReferenceId) ?? null
  );
}

function singleContextSourceReferenceId(
  scene: CanvasScene,
  targets: CanvasAssetContextMenuTargets
): string | null {
  if (targets.groupIds.length === 1 && targets.nodeIds.length === 0) {
    const groupId = targets.groupIds[0];
    return groupId ? (scene.groups[groupId]?.sourceAssetId ?? null) : null;
  }

  if (targets.nodeIds.length !== 1 || targets.groupIds.length !== 0) {
    return null;
  }

  const nodeId = targets.nodeIds[0];
  const node = nodeId
    ? scene.nodes.find((item) => item.id === nodeId)
    : undefined;
  const asset = node ? scene.assets[node.assetId] : null;
  return asset?.sourceAssetId ?? null;
}

function resolveSingleContextNodeAsset(
  scene: CanvasScene,
  targets: CanvasAssetContextMenuTargets
): { asset: CanvasAsset; node: CanvasNode } | null {
  if (targets.nodeIds.length !== 1 || targets.groupIds.length !== 0) {
    return null;
  }

  const nodeId = targets.nodeIds[0];
  const node = nodeId
    ? scene.nodes.find((item) => item.id === nodeId)
    : undefined;
  const asset = node ? scene.assets[node.assetId] : null;
  return node && asset ? { asset, node } : null;
}

function openReferenceMenuEntry(
  reference: CanvasAssetContextReference | null
): CanvasAssetContextMenuEntry | null {
  return reference ? canvasAssetContextMenuAction("open") : null;
}

function acknowledgeSourceIssueMenuEntry(
  issue: CanvasAssetContextMenuSelection["singleSourceIssue"]
): CanvasAssetContextMenuEntry | null {
  return issue
    ? canvasAssetContextMenuAction("acknowledge-source-issue", {
        labelKey:
          issue.status === "changed"
            ? "canvas.contextMenu.keepOldVersion"
            : "canvas.contextMenu.keepCurrentSnapshot"
      })
    : null;
}

function syncSourceIssueMenuEntry(
  singleNodeAsset: CanvasAssetContextMenuSelection["singleNodeAsset"],
  issue: CanvasAssetContextMenuSelection["singleSourceIssue"]
): CanvasAssetContextMenuEntry | null {
  return issue?.status === "changed" &&
    singleNodeAsset?.asset.sourcePageNumber === undefined
    ? canvasAssetContextMenuAction("sync-source", {
        labelKey: "canvas.contextMenu.syncSource"
      })
    : null;
}

function resolveSingleContextSourceIssue(
  singleNodeAsset: CanvasAssetContextMenuSelection["singleNodeAsset"],
  references: readonly CanvasSourceReference[]
): CanvasResolvedSourceIssue | null {
  const asset = singleNodeAsset?.asset;
  const sourceAssetId = asset?.sourceAssetId;
  if (!(asset && sourceAssetId)) {
    return null;
  }

  return resolveCanvasAssetSourceIssue(
    asset,
    references.find((reference) => reference.id === sourceAssetId)
  );
}

function videoPlaybackMenuEntry(
  singleNodeAsset: CanvasAssetContextMenuSelection["singleNodeAsset"],
  isVideoPlaybackActive: (nodeId: string) => boolean
): CanvasAssetContextMenuEntry | null {
  if (singleNodeAsset?.asset.kind !== "video") {
    return null;
  }

  return canvasAssetContextMenuAction(
    isVideoPlaybackActive(singleNodeAsset.node.id)
      ? "pause-video"
      : "play-video"
  );
}

function remoteVideoPageMenuEntry(
  reference: CanvasAssetContextReference | null
): CanvasAssetContextMenuEntry | null {
  return reference?.sourceKind === "remote-video" && reference.remoteVideo
    ? canvasAssetContextMenuAction("open-remote-page", {
        labelKey: remoteVideoCanvasOpenPageLabelKey(reference)
      })
    : null;
}

function revealReferenceMenuEntry(
  reference: CanvasAssetContextReference | null
): CanvasAssetContextMenuEntry | null {
  return reference?.sourceKind === "file" && !reference.missing
    ? canvasAssetContextMenuAction("reveal")
    : null;
}

function isCanvasAssetContextMenuEntry(
  entry: CanvasAssetContextMenuEntry | null
): entry is CanvasAssetContextMenuEntry {
  return entry !== null;
}

function remoteVideoCanvasOpenPageLabelKey(
  reference: CanvasAssetContextReference
): string {
  const provider = reference.remoteVideo?.provider;
  if (provider === "bilibili") {
    return "fileReferences.openOnBilibili";
  }

  if (provider === "youtube") {
    return "fileReferences.openOnYoutube";
  }

  return "canvas.contextMenu.openRemotePage";
}
