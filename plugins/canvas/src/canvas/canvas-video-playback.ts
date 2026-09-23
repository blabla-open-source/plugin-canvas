import {
  type IUI,
  type PointerEvent as LeaferPointerEvent,
  Resource
} from "leafer-ui";
import { createImageFill } from "./canvas-asset-rendering";
import type { CanvasAsset } from "./types";
import { videoFrameCanvasSize } from "./video-frame-size";
import {
  videoPlaybackProgressRatio,
  videoPlaybackSeekRatio
} from "./video-playback-progress";

interface CanvasVideoPlaybackHost {
  getImageDirectRendering: () => boolean;
  getVideoPlaybackMuted: () => boolean;
  view: HTMLElement;
}

interface VideoPlayer {
  element: IUI;
  endSeekListeners: (() => void) | null;
  frameCanvas: HTMLCanvasElement | null;
  frameRequestId: number | null;
  frameRequestType: "animation" | "video" | null;
  nodeId: string;
  posterUrl: string;
  resourceKey: string;
  seekActive: boolean;
  seekEditable: boolean | undefined;
  seekRenderId: number;
  video: HTMLVideoElement;
}

const VIDEO_PROGRESS_COLOR = "#ffffff";
const VIDEO_PROGRESS_HIT_HEIGHT = 18;
const VIDEO_PROGRESS_MAX_HEIGHT = 10;
const VIDEO_PROGRESS_TRACK_COLOR = "rgba(0, 0, 0, 0.5)";

export class CanvasVideoPlaybackController {
  private readonly host: CanvasVideoPlaybackHost;
  private ignoreElementToggleUntil = 0;
  private ignoreNativeToggleUntil = 0;
  private lastVideoToggleAt = 0;
  private readonly players = new Map<string, VideoPlayer>();
  private recentPointerDown: {
    expiresAt: number;
    nodeId: string;
  } | null = null;
  private suspended = false;

  constructor(host: CanvasVideoPlaybackHost) {
    this.host = host;
    this.host.view.ownerDocument.addEventListener(
      "dblclick",
      this.handleNativeDoubleClick,
      true
    );
  }

  toggle(nodeId: string, asset: CanvasAsset, element: IUI) {
    if (this.suspended) {
      return;
    }

    const player = this.players.get(nodeId);
    if (player) {
      if (performance.now() < this.ignoreElementToggleUntil) {
        return;
      }
      this.toggleExistingVideoPlayback(nodeId, player);
      return;
    }

    if (!asset.mediaUrl) {
      return;
    }

    this.ignoreNativeToggleUntil = performance.now() + 300;
    this.startVideoPlayback(nodeId, asset, element).catch((error) => {
      this.release(nodeId, true);
      console.error("Failed to play video on canvas", error);
    });
  }

  release(nodeId: string, restorePoster: boolean) {
    const player = this.players.get(nodeId);
    if (!player) {
      return;
    }

    this.cancelVideoFrame(player);
    this.players.delete(nodeId);
    player.video.pause();
    player.video.removeAttribute("src");
    player.video.load();
    player.video.remove();
    this.endVideoSeek(player);
    Resource.remove(player.resourceKey);

    if (restorePoster && player.posterUrl) {
      player.element.set({
        fill: createImageFill(
          player.posterUrl,
          this.host.getImageDirectRendering()
        )
      });
      player.element.forceUpdate("fill");
    }
  }

  hasActive(nodeId: string): boolean {
    return this.players.has(nodeId);
  }

  setSuspended(suspended: boolean) {
    if (this.suspended === suspended) {
      return;
    }

    this.suspended = suspended;
    if (!suspended) {
      return;
    }

    for (const nodeId of Array.from(this.players.keys())) {
      this.release(nodeId, true);
    }
  }

  destroy() {
    this.host.view.ownerDocument.removeEventListener(
      "dblclick",
      this.handleNativeDoubleClick,
      true
    );
    for (const nodeId of Array.from(this.players.keys())) {
      this.release(nodeId, false);
    }
  }

  handleProgressPointerDown(nodeId: string, event: LeaferPointerEvent) {
    this.recentPointerDown = {
      expiresAt: performance.now() + 1000,
      nodeId
    };

    const player = this.players.get(nodeId);
    if (!(player && isSeekableVideo(player.video))) {
      return;
    }

    if (!isVideoProgressPointer(player, event)) {
      return;
    }

    event.stopDefault();
    event.stop();
    this.beginVideoSeek(player);
    this.seekVideoPlayback(player, event);
  }

  handleProgressPointerMove(nodeId: string, event: LeaferPointerEvent) {
    const player = this.players.get(nodeId);
    if (!player?.seekActive) {
      return;
    }

    event.stopDefault();
    event.stop();
    this.seekVideoPlayback(player, event);
  }

  handleProgressPointerUp(nodeId: string, event: LeaferPointerEvent) {
    const player = this.players.get(nodeId);
    if (!player?.seekActive) {
      return;
    }

    event.stopDefault();
    event.stop();
    this.seekVideoPlayback(player, event);
    this.endVideoSeek(player);
  }

  private readonly handleNativeDoubleClick = (event: MouseEvent) => {
    if (performance.now() < this.ignoreNativeToggleUntil) {
      return;
    }

    if (
      this.players.size === 0 ||
      !clientPointHitsView(this.host.view, event.clientX, event.clientY)
    ) {
      return;
    }

    const nodeId =
      this.findNativeHitNode(event.clientX, event.clientY) ??
      this.recentPointerDownNode();
    const player = nodeId ? this.players.get(nodeId) : null;
    if (!(nodeId && player)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.ignoreElementToggleUntil = performance.now() + 600;
    this.toggleExistingVideoPlayback(nodeId, player);
  };

  private toggleExistingVideoPlayback(nodeId: string, player: VideoPlayer) {
    const now = performance.now();
    if (now - this.lastVideoToggleAt < 120) {
      return;
    }

    this.lastVideoToggleAt = now;
    if (player.video.paused) {
      this.resumeVideoPlayback(nodeId, player);
    } else {
      this.pauseVideoPlayback(player);
    }
  }

  private async startVideoPlayback(
    nodeId: string,
    asset: CanvasAsset,
    element: IUI
  ) {
    if (!asset.mediaUrl) {
      return;
    }

    const video = document.createElement("video");
    const resourceKey = `app-video:${nodeId}:${asset.id}:${asset.mediaUrl}`;
    video.autoplay = false;
    video.controls = false;
    video.setAttribute("aria-hidden", "true");
    video.dataset.appVideoNodeId = nodeId;
    if (asset.sourceAssetId) {
      video.dataset.appVideoSourceAssetId = asset.sourceAssetId;
    }
    video.loop = true;
    video.muted = this.host.getVideoPlaybackMuted();
    video.playsInline = true;
    video.preload = "auto";
    video.src = asset.mediaUrl;
    video.style.height = "1px";
    video.style.left = "-9999px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.position = "absolute";
    video.style.top = "0";
    video.style.width = "1px";
    this.host.view.append(video);

    const player: VideoPlayer = {
      element,
      endSeekListeners: null,
      frameCanvas: null,
      frameRequestId: null,
      frameRequestType: null,
      nodeId,
      posterUrl: asset.url ?? "",
      resourceKey,
      seekActive: false,
      seekEditable: undefined,
      seekRenderId: 0,
      video
    };
    this.players.set(nodeId, player);

    await waitForVideoReady(video);
    if (this.players.get(nodeId) !== player) {
      return;
    }
    if (this.suspended) {
      this.release(nodeId, true);
      return;
    }

    const frameCanvas = createVideoFrameCanvas(video, element);
    drawVideoFrameToCanvas(video, frameCanvas, element);
    player.frameCanvas = frameCanvas;

    Resource.setImage(
      resourceKey,
      frameCanvas as unknown as Record<string, unknown>
    );
    element.set({
      fill: createImageFill(resourceKey, true)
    });
    element.forceRender();

    await video.play();
    if (this.players.get(nodeId) !== player) {
      video.pause();
      return;
    }
    if (this.suspended) {
      this.release(nodeId, true);
      return;
    }
    this.scheduleVideoFrame(nodeId);
  }

  private pauseVideoPlayback(player: VideoPlayer) {
    this.cancelVideoFrame(player);
    player.video.pause();
    this.renderVideoFrame(player);
  }

  private resumeVideoPlayback(nodeId: string, player: VideoPlayer) {
    player.video.play().then(
      () => {
        if (this.players.get(nodeId) === player && !this.suspended) {
          this.scheduleVideoFrame(nodeId);
        }
      },
      (error) => {
        this.release(nodeId, true);
        console.error("Failed to resume video on canvas", error);
      }
    );
  }

  private scheduleVideoFrame(nodeId: string) {
    const player = this.players.get(nodeId);
    if (!player?.frameCanvas || player.video.paused || player.video.ended) {
      return;
    }

    const frameCanvas = player.frameCanvas;
    const requestVideoFrame = player.video.requestVideoFrameCallback;
    const onFrame = () => {
      const livePlayer = this.players.get(nodeId);
      if (livePlayer !== player) {
        return;
      }

      player.frameRequestId = null;
      player.frameRequestType = null;
      drawVideoFrameToCanvas(player.video, frameCanvas, player.element);
      player.element.forceRender();
      this.scheduleVideoFrame(nodeId);
    };

    if (requestVideoFrame) {
      player.frameRequestType = "video";
      player.frameRequestId = requestVideoFrame.call(player.video, onFrame);
      return;
    }

    player.frameRequestType = "animation";
    player.frameRequestId = window.requestAnimationFrame(onFrame);
  }

  private cancelVideoFrame(player: VideoPlayer) {
    if (player.frameRequestId === null) {
      return;
    }

    if (player.frameRequestType === "video") {
      player.video.cancelVideoFrameCallback?.(player.frameRequestId);
    } else {
      window.cancelAnimationFrame(player.frameRequestId);
    }

    player.frameRequestId = null;
    player.frameRequestType = null;
  }

  private beginVideoSeek(player: VideoPlayer) {
    player.seekActive = true;
    if (player.seekEditable === undefined) {
      player.seekEditable = Boolean(player.element.editable);
      player.element.set({ editable: false });
    }
    if (player.endSeekListeners) {
      return;
    }

    const endSeek = () => {
      this.endVideoSeek(player);
    };
    window.addEventListener("pointercancel", endSeek, true);
    window.addEventListener("pointerup", endSeek, true);
    window.addEventListener("blur", endSeek, true);
    player.endSeekListeners = () => {
      window.removeEventListener("pointercancel", endSeek, true);
      window.removeEventListener("pointerup", endSeek, true);
      window.removeEventListener("blur", endSeek, true);
    };
  }

  private endVideoSeek(player: VideoPlayer) {
    player.seekActive = false;
    if (player.seekEditable !== undefined) {
      player.element.set({ editable: player.seekEditable });
      player.seekEditable = undefined;
    }
    player.endSeekListeners?.();
    player.endSeekListeners = null;
  }

  private seekVideoPlayback(player: VideoPlayer, event: LeaferPointerEvent) {
    const point = event.getInnerPoint(player.element);
    const ratio = videoPlaybackSeekRatio(point.x, player.element.width ?? 0);
    if (ratio === null) {
      return;
    }

    this.cancelVideoFrame(player);
    player.video.currentTime = ratio * player.video.duration;
    this.renderVideoFrame(player);
    this.renderVideoFrameAfterSeek(player);
  }

  private renderVideoFrameAfterSeek(player: VideoPlayer) {
    const renderId = player.seekRenderId + 1;
    player.seekRenderId = renderId;
    player.video.addEventListener(
      "seeked",
      () => {
        if (player.seekRenderId === renderId) {
          this.renderVideoFrame(player);
          if (!(player.video.paused || this.suspended)) {
            this.scheduleVideoFrame(player.nodeId);
          }
        }
      },
      { once: true }
    );
  }

  private renderVideoFrame(player: VideoPlayer) {
    if (!player.frameCanvas) {
      return;
    }

    drawVideoFrameToCanvas(player.video, player.frameCanvas, player.element);
    player.element.forceRender();
  }

  private findNativeHitNode(clientX: number, clientY: number): string | null {
    for (const [nodeId, player] of this.players) {
      if (
        clientPointHitsElement(player.element, this.host.view, clientX, clientY)
      ) {
        return nodeId;
      }
    }

    return null;
  }

  private recentPointerDownNode(): string | null {
    const recent = this.recentPointerDown;
    if (!(recent && performance.now() <= recent.expiresAt)) {
      return null;
    }

    return this.players.has(recent.nodeId) ? recent.nodeId : null;
  }
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("error", onError);
      video.removeEventListener("loadeddata", onReady);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Unable to decode video source"));
    };

    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function createVideoFrameCanvas(
  video: HTMLVideoElement,
  element: IUI
): HTMLCanvasElement {
  const { height, width } = videoFrameSize(video, element);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function videoFrameSize(
  video: HTMLVideoElement,
  element: IUI
): { height: number; width: number } {
  return videoFrameCanvasSize({
    displayHeight: element.height ?? 0,
    displayWidth: element.width ?? 0,
    sourceHeight: video.videoHeight,
    sourceWidth: video.videoWidth
  });
}

function drawVideoFrameToCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  element: IUI
) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create video frame canvas context");
  }

  const { height, width } = videoFrameSize(video, element);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  drawVideoProgress(context, video, canvas);
}

function drawVideoProgress(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
) {
  const progress = videoPlaybackProgressRatio(video);
  if (progress === null) {
    return;
  }

  const barHeight = Math.min(
    canvas.height,
    Math.max(
      1,
      Math.min(VIDEO_PROGRESS_MAX_HEIGHT, Math.round(canvas.height * 0.018))
    )
  );
  const y = canvas.height - barHeight;
  const filledWidth =
    progress <= 0 ? 0 : Math.max(1, Math.round(canvas.width * progress));

  context.fillStyle = VIDEO_PROGRESS_TRACK_COLOR;
  context.fillRect(0, y, canvas.width, barHeight);

  if (filledWidth <= 0) {
    return;
  }

  context.fillStyle = VIDEO_PROGRESS_COLOR;
  context.fillRect(0, y, Math.min(canvas.width, filledWidth), barHeight);
}

function isSeekableVideo(video: HTMLVideoElement): boolean {
  return Number.isFinite(video.duration) && video.duration > 0;
}

function isVideoProgressPointer(
  player: VideoPlayer,
  event: LeaferPointerEvent
): boolean {
  const point = event.getInnerPoint(player.element);
  const height = player.element.height ?? 0;
  const width = player.element.width ?? 0;

  return (
    point.x >= 0 &&
    point.x <= width &&
    point.y >= Math.max(0, height - VIDEO_PROGRESS_HIT_HEIGHT) &&
    point.y <= height
  );
}

function clientPointHitsElement(
  element: IUI,
  view: HTMLElement,
  clientX: number,
  clientY: number
): boolean {
  const height = element.height ?? 0;
  const width = element.width ?? 0;
  if (!(width > 0 && height > 0)) {
    return false;
  }

  if (element.leafer) {
    const clientPoints = [
      element.getWorldPointByBox({ x: 0, y: 0 }),
      element.getWorldPointByBox({ x: width, y: 0 }),
      element.getWorldPointByBox({ x: width, y: height }),
      element.getWorldPointByBox({ x: 0, y: height })
    ].map((point) => element.leafer?.getClientPointByWorld(point));
    const xs = clientPoints.flatMap((point) => (point ? [point.x] : []));
    const ys = clientPoints.flatMap((point) => (point ? [point.y] : []));
    const tolerance = 1;

    return (
      xs.length === 4 &&
      ys.length === 4 &&
      clientX >= Math.min(...xs) - tolerance &&
      clientX <= Math.max(...xs) + tolerance &&
      clientY >= Math.min(...ys) - tolerance &&
      clientY <= Math.max(...ys) + tolerance
    );
  }

  const bounds = view.getBoundingClientRect();
  const innerPoint = element.getInnerPoint({
    x: clientX - bounds.left,
    y: clientY - bounds.top
  });

  return (
    innerPoint.x >= 0 &&
    innerPoint.x <= width &&
    innerPoint.y >= 0 &&
    innerPoint.y <= height
  );
}

function clientPointHitsView(
  view: HTMLElement,
  clientX: number,
  clientY: number
): boolean {
  const bounds = view.getBoundingClientRect();
  return (
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  );
}
