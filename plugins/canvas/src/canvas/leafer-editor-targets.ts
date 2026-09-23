import type { IUI } from "leafer-ui";

export type LeaferEditorTargetSync =
  | { kind: "clear" }
  | { kind: "select"; targets: IUI | IUI[] }
  | { kind: "unchanged" };

export function planLiveEditorTargetSync({
  liveGroupIds,
  liveNodeIds,
  readGroupId,
  readNodeId,
  targets,
}: {
  liveGroupIds: ReadonlySet<string>;
  liveNodeIds: ReadonlySet<string>;
  readGroupId: (target: IUI) => string | null;
  readNodeId: (target: IUI) => string | null;
  targets: readonly IUI[];
}): LeaferEditorTargetSync {
  if (targets.length === 0) {
    return { kind: "unchanged" };
  }

  const liveTargets = targets.filter((target) =>
    isLiveEditorTarget({ liveGroupIds, liveNodeIds, readGroupId, readNodeId, target })
  );
  if (liveTargets.length === targets.length) {
    return { kind: "unchanged" };
  }

  if (liveTargets.length === 0) {
    return { kind: "clear" };
  }

  const [firstTarget] = liveTargets;

  return {
    kind: "select",
    targets: liveTargets.length === 1 && firstTarget ? firstTarget : liveTargets,
  };
}

function isLiveEditorTarget({
  liveGroupIds,
  liveNodeIds,
  readGroupId,
  readNodeId,
  target,
}: {
  liveGroupIds: ReadonlySet<string>;
  liveNodeIds: ReadonlySet<string>;
  readGroupId: (target: IUI) => string | null;
  readNodeId: (target: IUI) => string | null;
  target: IUI;
}): boolean {
  const groupId = readGroupId(target);
  if (groupId) {
    return liveGroupIds.has(groupId);
  }

  const nodeId = readNodeId(target);
  if (nodeId) {
    return liveNodeIds.has(nodeId);
  }

  return true;
}
