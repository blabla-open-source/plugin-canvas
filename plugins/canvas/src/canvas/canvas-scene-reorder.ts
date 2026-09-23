import type { CanvasScene } from "./types";

export type CanvasSceneReorderOperation =
  | "backward"
  | "forward"
  | "to-back"
  | "to-front";

interface ReorderSceneItem {
  id: string;
  order: number;
  selected: boolean;
  type: "group" | "node";
  z: number;
}

export function nextCanvasSceneTopLevelZ(scene: CanvasScene): number {
  const zValues = [
    ...Object.values(scene.groups).map((group) => group.z),
    ...scene.nodes.flatMap((node) => (node.groupId ? [] : [node.z]))
  ];
  return zValues.length === 0 ? 0 : Math.max(...zValues) + 1;
}

export function reorderSceneTargets(
  scene: CanvasScene,
  targets: {
    groupIds: readonly string[];
    nodeIds: readonly string[];
  },
  operation: CanvasSceneReorderOperation
): CanvasScene {
  const selectedGroupIds = new Set(targets.groupIds);
  const selectedNodeIds = new Set(targets.nodeIds);
  const groupZUpdates = new Map<string, number>();
  const nodeZUpdates = new Map<string, number>();

  applyReorderedScope(
    [
      ...Object.values(scene.groups).map((group, order) => ({
        id: group.id,
        order,
        selected: selectedGroupIds.has(group.id),
        type: "group" as const,
        z: group.z
      })),
      ...scene.nodes.flatMap((node, order) =>
        node.groupId
          ? []
          : [
              {
                id: node.id,
                order,
                selected: selectedNodeIds.has(node.id),
                type: "node" as const,
                z: node.z
              }
            ]
      )
    ],
    operation,
    groupZUpdates,
    nodeZUpdates
  );

  const groupIds = new Set(
    scene.nodes.flatMap((node) => (node.groupId ? [node.groupId] : []))
  );
  for (const groupId of groupIds) {
    applyReorderedScope(
      scene.nodes.flatMap((node, order) =>
        node.groupId === groupId
          ? [
              {
                id: node.id,
                order,
                selected: selectedNodeIds.has(node.id),
                type: "node" as const,
                z: node.z
              }
            ]
          : []
      ),
      operation,
      groupZUpdates,
      nodeZUpdates
    );
  }

  if (groupZUpdates.size === 0 && nodeZUpdates.size === 0) {
    return scene;
  }

  return {
    ...scene,
    assets: scene.assets,
    groups:
      groupZUpdates.size === 0
        ? scene.groups
        : Object.fromEntries(
            Object.entries(scene.groups).map(([groupId, group]) => [
              groupId,
              groupZUpdates.has(groupId)
                ? { ...group, z: groupZUpdates.get(groupId) ?? group.z }
                : group
            ])
          ),
    nodes:
      nodeZUpdates.size === 0
        ? scene.nodes
        : scene.nodes.map((node) =>
            nodeZUpdates.has(node.id)
              ? { ...node, z: nodeZUpdates.get(node.id) ?? node.z }
              : node
          )
  };
}

function applyReorderedScope(
  items: ReorderSceneItem[],
  operation: CanvasSceneReorderOperation,
  groupZUpdates: Map<string, number>,
  nodeZUpdates: Map<string, number>
) {
  if (!items.some((item) => item.selected)) {
    return;
  }

  const sorted = [...items].sort(
    (a, b) => a.z - b.z || a.order - b.order || a.id.localeCompare(b.id)
  );
  const reordered = reorderSceneItems(sorted, operation);
  if (sameSceneItemOrder(sorted, reordered)) {
    return;
  }

  for (const [z, item] of reordered.entries()) {
    if (item.z === z) {
      continue;
    }

    if (item.type === "group") {
      groupZUpdates.set(item.id, z);
    } else {
      nodeZUpdates.set(item.id, z);
    }
  }
}

function reorderSceneItems(
  items: readonly ReorderSceneItem[],
  operation: CanvasSceneReorderOperation
): ReorderSceneItem[] {
  switch (operation) {
    case "to-back":
      return [
        ...items.filter((item) => item.selected),
        ...items.filter((item) => !item.selected)
      ];
    case "to-front":
      return [
        ...items.filter((item) => !item.selected),
        ...items.filter((item) => item.selected)
      ];
    case "forward": {
      const next = [...items];
      for (let index = next.length - 2; index >= 0; index -= 1) {
        const item = next[index];
        const above = next[index + 1];
        if (item?.selected && above && !above.selected) {
          next[index] = above;
          next[index + 1] = item;
        }
      }
      return next;
    }
    case "backward": {
      const next = [...items];
      for (let index = 1; index < next.length; index += 1) {
        const item = next[index];
        const below = next[index - 1];
        if (item?.selected && below && !below.selected) {
          next[index - 1] = item;
          next[index] = below;
        }
      }
      return next;
    }
    default: {
      const exhaustive: never = operation;
      throw new Error(
        `unsupported canvas scene reorder operation: ${exhaustive}`
      );
    }
  }
}

function sameSceneItemOrder(
  left: readonly ReorderSceneItem[],
  right: readonly ReorderSceneItem[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.id === right[index]?.id && item.type === right[index]?.type
    )
  );
}
