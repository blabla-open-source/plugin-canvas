import { type IUI, PointerEvent as LeaferPointerEvent } from "leafer-ui";
import { CanvasVideoPlaybackController } from "./canvas-video-playback";
import type { CanvasAsset } from "./types";

interface CanvasAssetInteractionHost {
  getImageDirectRendering: () => boolean;
  getVideoPlaybackMuted: () => boolean;
  onModelToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onRemoteVideoToggle?: (nodeId: string, asset: CanvasAsset) => void;
  view: HTMLElement;
}

interface InteractionBinding {
  doubleClickHandler: (event: LeaferPointerEvent) => void;
  element: IUI;
  key: string;
  pointerDownHandler?: (event: LeaferPointerEvent) => void;
  pointerMoveHandler?: (event: LeaferPointerEvent) => void;
  pointerUpHandler?: (event: LeaferPointerEvent) => void;
}

export class CanvasAssetInteractionController {
  private readonly bindings = new Map<string, InteractionBinding>();
  private readonly host: CanvasAssetInteractionHost;
  private readonly videoPlayback: CanvasVideoPlaybackController;

  constructor(host: CanvasAssetInteractionHost) {
    this.host = host;
    this.videoPlayback = new CanvasVideoPlaybackController({
      getImageDirectRendering: host.getImageDirectRendering,
      getVideoPlaybackMuted: host.getVideoPlaybackMuted,
      view: host.view
    });
  }

  sync(nodeId: string, asset: CanvasAsset, element: IUI | null) {
    if (!element) {
      this.release(nodeId, false);
      return;
    }

    const key = interactionBindingKey(asset);
    const binding = this.bindings.get(nodeId);
    if (binding?.key === key && binding.element === element) {
      return;
    }

    this.release(nodeId, false);
    if (asset.kind !== "video" && asset.kind !== "model") {
      return;
    }

    const doubleClickHandler = (event: LeaferPointerEvent) => {
      if (!isPrimaryPointerEvent(event)) {
        return;
      }

      if (this.toggleVideoPlayback(nodeId, asset, element)) {
        return;
      }

      if (this.toggleModelSurface(nodeId, asset)) {
        return;
      }
    };
    element.on(LeaferPointerEvent.DOUBLE_CLICK, doubleClickHandler);

    if (asset.kind !== "video") {
      this.bindings.set(nodeId, { doubleClickHandler, element, key });
      return;
    }

    const pointerDownHandler = (event: LeaferPointerEvent) => {
      this.videoPlayback.handleProgressPointerDown(nodeId, event);
    };
    const pointerMoveHandler = (event: LeaferPointerEvent) => {
      this.videoPlayback.handleProgressPointerMove(nodeId, event);
    };
    const pointerUpHandler = (event: LeaferPointerEvent) => {
      this.videoPlayback.handleProgressPointerUp(nodeId, event);
    };
    element.on(LeaferPointerEvent.DOWN, pointerDownHandler);
    element.on(LeaferPointerEvent.MOVE, pointerMoveHandler);
    element.on(LeaferPointerEvent.UP, pointerUpHandler);

    this.bindings.set(nodeId, {
      doubleClickHandler,
      element,
      key,
      pointerDownHandler,
      pointerMoveHandler,
      pointerUpHandler
    });
  }

  release(nodeId: string, restorePoster: boolean) {
    this.videoPlayback.release(nodeId, restorePoster);

    const binding = this.bindings.get(nodeId);
    if (!binding) {
      return;
    }

    binding.element.off(
      LeaferPointerEvent.DOUBLE_CLICK,
      binding.doubleClickHandler
    );
    if (binding.pointerDownHandler) {
      binding.element.off(LeaferPointerEvent.DOWN, binding.pointerDownHandler);
    }
    if (binding.pointerMoveHandler) {
      binding.element.off(LeaferPointerEvent.MOVE, binding.pointerMoveHandler);
    }
    if (binding.pointerUpHandler) {
      binding.element.off(LeaferPointerEvent.UP, binding.pointerUpHandler);
    }
    this.bindings.delete(nodeId);
  }

  hasActiveInteraction(nodeId: string): boolean {
    return this.videoPlayback.hasActive(nodeId);
  }

  toggleVideoPlayback(
    nodeId: string,
    asset: CanvasAsset,
    element: IUI
  ): boolean {
    if (asset.kind !== "video") {
      return false;
    }

    if (asset.remoteVideo) {
      this.host.onRemoteVideoToggle?.(nodeId, asset);
      return true;
    }

    this.videoPlayback.toggle(nodeId, asset, element);
    return true;
  }

  toggleModelSurface(nodeId: string, asset: CanvasAsset): boolean {
    if (asset.kind !== "model") {
      return false;
    }

    if (asset.mediaUrl) {
      this.host.onModelToggle?.(nodeId, asset);
    }
    return true;
  }

  setSuspended(suspended: boolean) {
    this.videoPlayback.setSuspended(suspended);
  }

  destroy() {
    for (const nodeId of Array.from(this.bindings.keys())) {
      this.release(nodeId, false);
    }
    this.videoPlayback.destroy();
  }
}

function interactionBindingKey(asset: CanvasAsset): string {
  return [
    asset.kind,
    asset.id,
    asset.remoteVideo?.embedUrl ?? "",
    asset.mediaUrl ?? "",
    asset.sourceAssetId ?? "",
    asset.url ?? ""
  ].join(":");
}

function isPrimaryPointerEvent(event: LeaferPointerEvent): boolean {
  const candidate = event as unknown as {
    button?: number;
    event?: { button?: number };
    origin?: { button?: number };
  };
  const button =
    candidate.button ?? candidate.event?.button ?? candidate.origin?.button;

  return button === undefined || button === 0;
}
