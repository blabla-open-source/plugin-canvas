import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  type CanvasCollageThumbnailExport,
  canvasThumbnailSizeForScene,
  exportCanvasCollageThumbnail
} from "./canvas-collage-render";
import type { CanvasScene } from "./types";

export function useCanvasThumbnailFlush({
  onThumbnailChange,
  sceneRef,
  thumbnail,
  thumbnailFallbackSize,
  thumbnailRevision
}: {
  onThumbnailChange: (thumbnail: CanvasCollageThumbnailExport) => Promise<void>;
  sceneRef: RefObject<CanvasScene | null>;
  thumbnail?: { height: number; width: number };
  thumbnailFallbackSize: { height: number; width: number };
  thumbnailRevision: number;
}): () => Promise<void> {
  const onThumbnailChangeRef = useRef(onThumbnailChange);
  const thumbnailRef = useRef(thumbnail);
  const thumbnailRevisionRef = useRef(thumbnailRevision);
  const flushedThumbnailRevisionRef = useRef<number | null>(null);
  const thumbnailFlushPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    onThumbnailChangeRef.current = onThumbnailChange;
  }, [onThumbnailChange]);

  useEffect(() => {
    thumbnailRef.current = thumbnail;
  }, [thumbnail]);

  useEffect(() => {
    thumbnailRevisionRef.current = thumbnailRevision;
  }, [thumbnailRevision]);

  return useCallback(() => {
    const flushLatestThumbnail = (): Promise<void> => {
      const inFlight = thumbnailFlushPromiseRef.current;
      if (inFlight) {
        return inFlight;
      }
      const currentThumbnailRevision = thumbnailRevisionRef.current;
      const scene = sceneRef.current;

      if (!scene) {
        return Promise.resolve();
      }

      const thumbnailSize = canvasThumbnailSizeForScene(
        scene,
        thumbnailFallbackSize
      );
      const thumbnailMatchesExpectedSize = canvasThumbnailMatchesExpectedSize(
        thumbnailRef.current,
        thumbnailSize
      );
      if (
        thumbnailMatchesExpectedSize &&
        flushedThumbnailRevisionRef.current === null
      ) {
        flushedThumbnailRevisionRef.current = currentThumbnailRevision;
      }

      if (!shouldFlushCanvasThumbnail({
        currentThumbnailRevision,
        flushedThumbnailRevision: flushedThumbnailRevisionRef.current,
        hasScene: true,
        inFlight: false,
        thumbnailMatchesExpectedSize
      })) {
        return Promise.resolve();
      }

      const flushPromise = exportCanvasCollageThumbnail({
        ...thumbnailSize,
        scene
      })
        .then(async (thumbnail) => {
          await onThumbnailChangeRef.current(thumbnail);
          flushedThumbnailRevisionRef.current = Math.max(
            flushedThumbnailRevisionRef.current ?? currentThumbnailRevision,
            currentThumbnailRevision
          );
        })
        .finally(() => {
          if (thumbnailFlushPromiseRef.current === flushPromise) {
            thumbnailFlushPromiseRef.current = null;
          }
        })
        .then(() =>
          thumbnailRevisionRef.current > currentThumbnailRevision
            ? flushLatestThumbnail()
            : undefined
        );

      thumbnailFlushPromiseRef.current = flushPromise;
      return flushPromise;
    };

    return flushLatestThumbnail();
  }, [sceneRef, thumbnailFallbackSize]);
}

export function shouldFlushCanvasThumbnail({
  currentThumbnailRevision,
  flushedThumbnailRevision,
  hasScene,
  inFlight,
  thumbnailMatchesExpectedSize
}: {
  currentThumbnailRevision: number;
  flushedThumbnailRevision: number | null;
  hasScene: boolean;
  inFlight: boolean;
  thumbnailMatchesExpectedSize: boolean;
}): boolean {
  if (!(hasScene && !inFlight)) {
    return false;
  }
  if (!thumbnailMatchesExpectedSize) {
    return true;
  }

  return (
    flushedThumbnailRevision !== null &&
    currentThumbnailRevision > flushedThumbnailRevision
  );
}

function canvasThumbnailMatchesExpectedSize(
  thumbnail: { height: number; width: number } | undefined,
  expectedSize: { height: number; width: number }
): boolean {
  return (
    thumbnail?.height === expectedSize.height &&
    thumbnail.width === expectedSize.width
  );
}
