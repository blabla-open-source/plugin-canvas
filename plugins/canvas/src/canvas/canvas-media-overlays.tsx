import { type RefObject, useEffect, useState } from "react";
import type { CanvasHostHandle } from "./canvas-host";
import type { CanvasElementClientRect } from "./leafer-runtime-geometry";
import { CanvasModelViewerSurface } from "./canvas-model-viewer-surface";
import type { CanvasAsset } from "./types";

const REMOTE_VIDEO_CANVAS_EVENT_GUTTER_PX = 12;

export interface RemoteVideoOverlayState {
  assetId: string;
  name: string;
  nodeId: string;
  remoteVideo: NonNullable<CanvasAsset["remoteVideo"]>;
}

export interface ModelOverlayState {
  assetId: string;
  mediaUrl: string;
  name: string;
  nodeId: string;
  sourceAssetId?: string;
}

export function RemoteVideoCanvasOverlay({
  hostRef,
  interactive,
  muted,
  onClose,
  overlay
}: {
  hostRef: RefObject<CanvasHostHandle | null>;
  interactive: boolean;
  muted: boolean;
  onClose: () => void;
  overlay: RemoteVideoOverlayState;
}) {
  const layout = useHostElementLayout(hostRef, overlay.nodeId);

  if (!layout) {
    return null;
  }

  const eventGutter = Math.min(
    REMOTE_VIDEO_CANVAS_EVENT_GUTTER_PX,
    Math.max(0, Math.floor(Math.min(layout.width, layout.height) / 6))
  );
  const embedUrl = remoteVideoEmbedUrl(overlay.remoteVideo, muted);

  return (
    <div
      className="canvas-remote-video-layer"
      data-testid="canvas-remote-video-overlay"
    >
      <div
        className="canvas-remote-video-frame"
        style={{
          height: layout.height,
          left: layout.left,
          top: layout.top,
          width: layout.width
        }}
      >
        <iframe
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          className={`canvas-remote-video-player ${
            interactive ? "canvas-remote-video-player-interactive" : ""
          }`}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          src={embedUrl}
          style={{
            height: `calc(100% - ${eventGutter * 2}px)`,
            left: eventGutter,
            top: eventGutter,
            width: `calc(100% - ${eventGutter * 2}px)`
          }}
          title={overlay.remoteVideo.title ?? overlay.name}
        />
        <button
          aria-label="Stop remote video"
          className={`canvas-remote-video-close ${
            interactive ? "canvas-remote-video-close-interactive" : ""
          }`}
          onClick={onClose}
          style={{
            right: eventGutter + 8,
            top: eventGutter + 8
          }}
          title="Stop remote video"
          type="button"
        >
          X
        </button>
      </div>
    </div>
  );
}

export function ModelCanvasOverlay({
  hostRef,
  interactive,
  onClose,
  overlay
}: {
  hostRef: RefObject<CanvasHostHandle | null>;
  interactive: boolean;
  onClose: () => void;
  overlay: ModelOverlayState;
}) {
  const layout = useHostElementLayout(hostRef, overlay.nodeId);

  if (!layout) {
    return null;
  }

  return (
    <div className="canvas-model-layer" data-testid="canvas-model-overlay">
      <div
        className="canvas-model-frame"
        style={{
          height: layout.height,
          left: layout.left,
          top: layout.top,
          width: layout.width
        }}
      >
        <CanvasModelViewerSurface
          className={interactive ? "canvas-model-viewer-interactive" : ""}
          name={overlay.name}
          sourceUrl={overlay.mediaUrl}
          visible
        />
        <button
          aria-label="Close model viewer"
          className={`canvas-model-close ${
            interactive ? "canvas-model-close-interactive" : ""
          }`}
          onClick={onClose}
          title="Close model viewer"
          type="button"
        >
          X
        </button>
      </div>
    </div>
  );
}

function useHostElementLayout(
  hostRef: RefObject<CanvasHostHandle | null>,
  nodeId: string
): CanvasElementClientRect | null {
  const [layout, setLayout] = useState<CanvasElementClientRect | null>(null);

  useEffect(() => {
    let frameId = 0;

    const tick = () => {
      const nextLayout = hostRef.current?.elementClientRect(nodeId) ?? null;
      setLayout((current) =>
        sameElementClientRect(current, nextLayout) ? current : nextLayout
      );
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [hostRef, nodeId]);

  return layout;
}

function sameElementClientRect(
  left: CanvasElementClientRect | null,
  right: CanvasElementClientRect | null
): boolean {
  return (
    left?.height === right?.height &&
    left?.left === right?.left &&
    left?.top === right?.top &&
    left?.width === right?.width
  );
}

function remoteVideoEmbedUrl(
  remoteVideo: RemoteVideoOverlayState["remoteVideo"],
  muted: boolean
): string {
  const url = new URL(remoteVideo.embedUrl, window.location.href);
  if (!(url.protocol === "http:" || url.protocol === "https:")) {
    return url.toString();
  }

  url.searchParams.set("autoplay", "1");

  if (remoteVideo.provider === "youtube") {
    url.searchParams.set("enablejsapi", "1");
    if (muted) {
      url.searchParams.set("mute", "1");
    }
    if (window.location.origin) {
      url.searchParams.set("origin", window.location.origin);
    }
    return url.toString();
  }

  if (remoteVideo.provider === "bilibili") {
    url.searchParams.set("high_quality", "1");
    if (muted) {
      url.searchParams.set("muted", "1");
    }
    return url.toString();
  }

  if (muted) {
    url.searchParams.set("mute", "1");
  }
  return url.toString();
}
