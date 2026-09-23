import type {
  CanvasAsset,
  CanvasGroup,
  CanvasNode,
  CanvasScene
} from "./types";
import { nextCanvasSceneTopLevelZ } from "./canvas-scene-reorder";

const CANVAS_DUPLICATE_OFFSET = 24;

export interface CanvasSceneTargets {
  groupIds: readonly string[];
  nodeIds: readonly string[];
}

export interface DuplicateSceneTargetsResult {
  scene: CanvasScene;
  targets: CanvasSceneTargets;
}

export function duplicateSceneTargets(
  scene: CanvasScene,
  targets: CanvasSceneTargets
): DuplicateSceneTargetsResult {
  const selectedGroupIds = new Set(
    targets.groupIds.filter((groupId) => scene.groups[groupId])
  );
  const groups = { ...scene.groups };
  const nodes = [...scene.nodes];
  const duplicatedGroupIds: string[] = [];
  const duplicatedNodeIds: string[] = [];
  const nextChildZByGroupId = new Map<string, number>();
  let nextTopLevelZ = nextCanvasSceneTopLevelZ(scene);

  for (const groupId of targets.groupIds) {
    const group = scene.groups[groupId];
    if (!group) {
      continue;
    }

    const nextGroupId = crypto.randomUUID();
    duplicatedGroupIds.push(nextGroupId);
    groups[nextGroupId] = {
      ...group,
      id: nextGroupId,
      x: group.x + CANVAS_DUPLICATE_OFFSET,
      y: group.y + CANVAS_DUPLICATE_OFFSET,
      z: nextTopLevelZ
    };
    nextTopLevelZ += 1;

    for (const node of scene.nodes) {
      if (node.groupId !== groupId) {
        continue;
      }

      const nextNodeId = crypto.randomUUID();
      duplicatedNodeIds.push(nextNodeId);
      nodes.push({
        ...node,
        groupId: nextGroupId,
        id: nextNodeId
      });
    }
  }

  for (const nodeId of targets.nodeIds) {
    const node = scene.nodes.find((item) => item.id === nodeId);
    if (!node || (node.groupId && selectedGroupIds.has(node.groupId))) {
      continue;
    }

    const nextNodeId = crypto.randomUUID();
    duplicatedNodeIds.push(nextNodeId);
    nodes.push({
      ...node,
      id: nextNodeId,
      x: node.x + CANVAS_DUPLICATE_OFFSET,
      y: node.y + CANVAS_DUPLICATE_OFFSET,
      z: node.groupId
        ? nextChildSceneZ(scene, nextChildZByGroupId, node.groupId)
        : nextTopLevelZ
    });

    if (!node.groupId) {
      nextTopLevelZ += 1;
    }
  }

  if (duplicatedGroupIds.length === 0 && duplicatedNodeIds.length === 0) {
    return {
      scene,
      targets: {
        groupIds: [],
        nodeIds: []
      }
    };
  }

  return {
    scene: {
      assets: scene.assets,
      groups,
      nodes
    },
    targets: {
      groupIds: duplicatedGroupIds,
      nodeIds: duplicatedNodeIds
    }
  };
}

export function removeSceneTargets(
  scene: CanvasScene,
  targets: CanvasSceneTargets
): CanvasScene {
  const groupIds = new Set(targets.groupIds);
  const nodeIds = new Set(targets.nodeIds);
  if (groupIds.size === 0 && nodeIds.size === 0) {
    return scene;
  }

  const nodes = scene.nodes.filter(
    (node) =>
      !(nodeIds.has(node.id) || (node.groupId && groupIds.has(node.groupId)))
  );
  if (nodes.length === scene.nodes.length) {
    return scene;
  }

  return {
    assets: retainReferencedAssets(scene.assets, nodes),
    groups: retainNonEmptyGroups(scene.groups, nodes, groupIds),
    nodes
  };
}

export function emptyCanvasSceneTargets(): CanvasSceneTargets {
  return {
    groupIds: [],
    nodeIds: []
  };
}

export function hasCanvasSceneTargets(targets: CanvasSceneTargets): boolean {
  return targets.groupIds.length > 0 || targets.nodeIds.length > 0;
}

function nextChildSceneZ(
  scene: CanvasScene,
  nextChildZByGroupId: Map<string, number>,
  groupId: string
): number {
  const existing = nextChildZByGroupId.get(groupId);
  if (existing !== undefined) {
    nextChildZByGroupId.set(groupId, existing + 1);
    return existing;
  }

  const zValues = scene.nodes.flatMap((node) =>
    node.groupId === groupId ? [node.z] : []
  );
  const nextZ = zValues.length === 0 ? 0 : Math.max(...zValues) + 1;
  nextChildZByGroupId.set(groupId, nextZ + 1);
  return nextZ;
}

function retainReferencedAssets(
  assets: Record<string, CanvasAsset>,
  nodes: readonly CanvasNode[]
): Record<string, CanvasAsset> {
  const liveAssetIds = new Set(nodes.map((node) => node.assetId));
  return Object.fromEntries(
    Object.entries(assets).filter(([assetId]) => liveAssetIds.has(assetId))
  );
}

function retainNonEmptyGroups(
  groups: Record<string, CanvasGroup>,
  nodes: readonly CanvasNode[],
  removedGroupIds: ReadonlySet<string>
): Record<string, CanvasGroup> {
  const liveGroupIds = new Set(
    nodes.flatMap((node) => (node.groupId ? [node.groupId] : []))
  );

  return Object.fromEntries(
    Object.entries(groups).filter(
      ([groupId]) => liveGroupIds.has(groupId) && !removedGroupIds.has(groupId)
    )
  );
}
