import type { CanvasAssetContextMenuAction } from "./canvas-asset-context-menu-model";

const LABEL_BY_KEY: Record<string, string> = {
  "canvas.contextMenu.bringForward": "Bring forward",
  "canvas.contextMenu.bringToFront": "Bring to front",
  "canvas.contextMenu.duplicateNode": "Duplicate",
  "canvas.contextMenu.keepCurrentSnapshot": "Keep current snapshot",
  "canvas.contextMenu.keepOldVersion": "Keep old version",
  "canvas.contextMenu.open": "Open",
  "canvas.contextMenu.openRemotePage": "Open remote page",
  "canvas.contextMenu.pauseVideo": "Pause video",
  "canvas.contextMenu.playVideo": "Play video",
  "canvas.contextMenu.removeFromCanvas": "Remove from canvas",
  "canvas.contextMenu.reveal": "Reveal",
  "canvas.contextMenu.sendBackward": "Send backward",
  "canvas.contextMenu.sendToBack": "Send to back",
  "canvas.contextMenu.syncSource": "Sync source",
  "fileReferences.openOnBilibili": "Open on Bilibili",
  "fileReferences.openOnYoutube": "Open on YouTube"
};

export function canvasAssetContextMenuLabelKey(
  action: CanvasAssetContextMenuAction
): string {
  switch (action) {
    case "acknowledge-source-issue":
      return "canvas.contextMenu.keepOldVersion";
    case "bring-forward":
      return "canvas.contextMenu.bringForward";
    case "bring-to-front":
      return "canvas.contextMenu.bringToFront";
    case "duplicate-node":
      return "canvas.contextMenu.duplicateNode";
    case "open":
      return "canvas.contextMenu.open";
    case "open-remote-page":
      return "canvas.contextMenu.openRemotePage";
    case "pause-video":
      return "canvas.contextMenu.pauseVideo";
    case "play-video":
      return "canvas.contextMenu.playVideo";
    case "remove-from-canvas":
      return "canvas.contextMenu.removeFromCanvas";
    case "reveal":
      return "canvas.contextMenu.reveal";
    case "send-backward":
      return "canvas.contextMenu.sendBackward";
    case "send-to-back":
      return "canvas.contextMenu.sendToBack";
    case "sync-source":
      return "canvas.contextMenu.syncSource";
    default: {
      const exhaustive: never = action;
      throw new Error(
        `unsupported canvas asset context menu label: ${exhaustive}`
      );
    }
  }
}

export function canvasAssetContextMenuLabel(
  action: CanvasAssetContextMenuAction,
  labelKey?: string
): string {
  const key = labelKey ?? canvasAssetContextMenuLabelKey(action);
  return LABEL_BY_KEY[key] ?? key;
}
