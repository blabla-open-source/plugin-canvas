import type { Group } from "leafer-ui";
import type { CanvasAsset, CanvasGroup } from "./types";

export function leaferNodeRuntimeState(
  asset: Pick<CanvasAsset, "runtimeOnly">,
) {
  const interactive = !asset.runtimeOnly;
  return { editable: interactive, hitChildren: interactive, hitSelf: interactive };
}

export function leaferGroupRuntimeState(
  group: Pick<CanvasGroup, "runtimeOnly">,
) {
  const interactive = !group.runtimeOnly;
  return { editable: interactive, hitSelf: interactive };
}

export function updateLeaferGroupElement(
  element: Group,
  group: CanvasGroup,
): void {
  element.set({
    ...leaferGroupRuntimeState(group),
    height: group.height,
    hitChildren: false,
    rotation: group.rotation,
    scaleX: 1,
    scaleY: 1,
    width: group.width,
    x: group.x,
    y: group.y,
    zIndex: group.z,
  } as never);
}
