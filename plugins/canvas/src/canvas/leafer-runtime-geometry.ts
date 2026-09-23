import type { IEditorScaleData, IUI } from "leafer-ui";
import type { CanvasSnapBox, CanvasSnapPoint } from "./canvas-snapping";
import type { CanvasGroup, CanvasNode } from "./types";

export type CanvasNodeLayout = Pick<
  CanvasNode,
  "height" | "rotation" | "width" | "x" | "y"
>;
export type CanvasGroupLayout = Pick<
  CanvasGroup,
  "height" | "rotation" | "width" | "x" | "y"
>;

export interface CanvasElementClientRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export function readElementSnapBox(
  id: string,
  element: IUI,
  parent: IUI
): CanvasSnapBox | null {
  if (element.parent !== parent) {
    return null;
  }

  const box = {
    height: element.height ?? 0,
    id,
    preserveAspectRatio: Boolean(element.lockRatio),
    width: element.width ?? 0,
    x: element.x ?? 0,
    y: element.y ?? 0
  };

  if (
    Number.isFinite(box.x) &&
    Number.isFinite(box.y) &&
    Number.isFinite(box.width) &&
    Number.isFinite(box.height) &&
    box.width > 0 &&
    box.height > 0
  ) {
    return box;
  }

  return null;
}

export function nodeSnapBoxId(nodeId: string): string {
  return `node:${nodeId}`;
}

export function groupSnapBoxId(groupId: string): string {
  return `group:${groupId}`;
}

export function nearlyEqualNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.0001;
}

export function readNodeLayout(element: IUI): CanvasNodeLayout {
  return {
    height: element.height ?? 1,
    rotation: element.rotation ?? 0,
    width: element.width ?? 1,
    x: element.x ?? 0,
    y: element.y ?? 0
  };
}

export function readGroupLayout(element: IUI): CanvasGroupLayout {
  return {
    height: element.height ?? 1,
    rotation: element.rotation ?? 0,
    width: element.width ?? 1,
    x: element.x ?? 0,
    y: element.y ?? 0
  };
}

export function readElementClientRect(
  element: IUI,
  view: HTMLElement
): CanvasElementClientRect | null {
  const height = element.height ?? 0;
  const width = element.width ?? 0;
  if (!(width > 0 && height > 0 && element.leafer)) {
    return null;
  }

  const topLeft = element.leafer.getClientPointByWorld(
    element.getWorldPointByBox({ x: 0, y: 0 })
  );
  const topRight = element.leafer.getClientPointByWorld(
    element.getWorldPointByBox({ x: width, y: 0 })
  );
  const bottomLeft = element.leafer.getClientPointByWorld(
    element.getWorldPointByBox({ x: 0, y: height })
  );
  const bottomRight = element.leafer.getClientPointByWorld(
    element.getWorldPointByBox({ x: width, y: height })
  );

  if (!(topLeft && topRight && bottomLeft && bottomRight)) {
    return null;
  }

  const viewBounds = view.getBoundingClientRect();
  const left =
    Math.min(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) -
    viewBounds.left;
  const top =
    Math.min(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y) -
    viewBounds.top;
  const right =
    Math.max(topLeft.x, topRight.x, bottomLeft.x, bottomRight.x) -
    viewBounds.left;
  const bottom =
    Math.max(topLeft.y, topRight.y, bottomLeft.y, bottomRight.y) -
    viewBounds.top;
  const clientWidth = right - left;
  const clientHeight = bottom - top;

  if (
    !(
      [left, top, clientWidth, clientHeight].every(Number.isFinite) &&
      clientWidth > 0 &&
      clientHeight > 0
    )
  ) {
    return null;
  }

  return {
    height: clientHeight,
    left,
    top,
    width: clientWidth
  };
}

export function scaleOriginPoint(
  origin: IEditorScaleData["origin"]
): CanvasSnapPoint | null {
  if (
    typeof origin === "object" &&
    origin !== null &&
    Number.isFinite(origin.x) &&
    Number.isFinite(origin.y)
  ) {
    return {
      x: origin.x,
      y: origin.y
    };
  }

  return null;
}
