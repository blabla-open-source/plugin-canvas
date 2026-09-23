import { EditorScaleEvent, TransformTool } from "@leafer-in/editor";
import type { App } from "leafer-ui";

type EditorScaleDragData = Parameters<TransformTool["scaleWithDrag"]>[0];

class CanvasSnappingTransformTool extends TransformTool {
  override scaleWithDrag(data: EditorScaleDragData): void {
    if (!this.checkTransform("resizeable")) {
      return;
    }

    const { editor, mergeConfig, target } = this.editBox;
    const scaleData = readEditorScaleDragData(data);

    if (!scaleData) {
      return;
    }

    const { origin } = scaleData;
    let { scaleX, scaleY } = scaleData;

    const check = mergeConfig.beforeScale?.({
      drag: data.drag,
      origin,
      scaleX,
      scaleY,
      target
    });

    if (check === false) {
      return;
    }

    if (isScaleOverride(check)) {
      scaleX = check.scaleX;
      scaleY = check.scaleY;
    }

    const nextData = {
      ...data,
      editor,
      origin,
      scaleX,
      scaleY,
      target,
      worldOrigin: target.getWorldPoint(origin)
    };

    this.emitEvent(
      new EditorScaleEvent(EditorScaleEvent.BEFORE_SCALE, nextData)
    );
    const event = new EditorScaleEvent(EditorScaleEvent.SCALE, nextData);
    this.editTool?.onScaleWithDrag?.(event);
    this.emitEvent(event);
  }
}

export function installCanvasSnappingTransformTool(editor: App["editor"]): void {
  const transformTool = new CanvasSnappingTransformTool();

  transformTool.editBox = editor.editBox as TransformTool["editBox"];
  Object.defineProperty(transformTool, "editTool", {
    configurable: true,
    get: () => editor.editTool
  });
  editor.editBox.transformTool = transformTool;
}

function readEditorScaleDragData(data: EditorScaleDragData): {
  origin: NonNullable<EditorScaleDragData["origin"]>;
  scaleX: number;
  scaleY: number;
} | null {
  const { origin, scaleX, scaleY } = data;

  if (
    origin &&
    typeof scaleX === "number" &&
    typeof scaleY === "number" &&
    Number.isFinite(scaleX) &&
    Number.isFinite(scaleY)
  ) {
    return { origin, scaleX, scaleY };
  }

  return null;
}

function isScaleOverride(
  value: unknown
): value is { scaleX: number; scaleY: number } {
  if (!(typeof value === "object" && value !== null)) {
    return false;
  }

  const scale = value as { scaleX?: unknown; scaleY?: unknown };
  return Number.isFinite(scale.scaleX) && Number.isFinite(scale.scaleY);
}
