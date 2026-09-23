import {
  type RefObject,
  useEffect,
  useMemo,
  useState,
  type WheelEvent
} from "react";
import type { CanvasHostHandle } from "./canvas-host";
import type { CanvasSourceIssueMarker } from "./canvas-source-status";
import type { CanvasViewport } from "./types";

const CANVAS_SOURCE_ISSUE_MARKER_LIMIT = 200;

interface CanvasSourceIssueMarkerLayout extends CanvasSourceIssueMarker {
  left: number;
  top: number;
}

export function CanvasSourceIssueMarkers({
  hostRef,
  markers,
  onKeepCurrent,
  onSyncLatest,
  viewport,
}: {
  hostRef: RefObject<CanvasHostHandle | null>;
  markers: readonly CanvasSourceIssueMarker[];
  onKeepCurrent: (marker: CanvasSourceIssueMarker) => void;
  onSyncLatest?: (marker: CanvasSourceIssueMarker) => void;
  viewport: CanvasViewport;
}) {
  const activeMarkers = useMemo(
    () => markers.slice(0, CANVAS_SOURCE_ISSUE_MARKER_LIMIT),
    [markers]
  );
  const [layouts, setLayouts] = useState<CanvasSourceIssueMarkerLayout[]>([]);
  const forwardWheel = (event: WheelEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    event.preventDefault();
    host.forwardWheel({
      altKey: event.altKey,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey
    });
  };

  useEffect(() => {
    if (activeMarkers.length === 0) {
      setLayouts((current) => (current.length === 0 ? current : []));
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const host = hostRef.current;
      const nextLayouts = host
        ? activeMarkers.flatMap((marker) => {
            const rect = host.elementClientRect(marker.nodeId);
            return rect
              ? [
                  {
                    ...marker,
                    left: Math.round(rect.left + rect.width - 10),
                    top: Math.round(rect.top + 8)
                  }
                ]
              : [];
          })
        : [];

      setLayouts((current) =>
        sameSourceIssueMarkerLayouts(current, nextLayouts)
          ? current
          : nextLayouts
      );
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeMarkers, hostRef, viewport.x, viewport.y, viewport.zoom]);

  if (layouts.length === 0) {
    return null;
  }

  return (
    <div
      className="canvas-source-issue-layer"
      data-testid="canvas-source-issue-markers"
    >
      {layouts.map((layout) => (
        <div
          className="canvas-source-issue-marker"
          key={layout.nodeId}
          onWheel={forwardWheel}
          style={{
            transform: `translate(${layout.left}px, ${layout.top}px)`
          }}
        >
          <button
            aria-label={sourceIssueMarkerTitle(layout)}
            className={`canvas-source-issue-badge canvas-source-issue-badge-${layout.status}`}
            data-source-status={layout.status}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            {sourceIssueMarkerShortLabel(layout)}
          </button>
          <div className="canvas-source-issue-popover">
            <div className="canvas-source-issue-title">
              {sourceIssueMarkerTitle(layout)}
            </div>
            <div className="canvas-source-issue-description">
              {layout.message ?? sourceIssueMarkerDescription(layout)}
            </div>
            {layout.status === "changed" && onSyncLatest ? (
              <button
                className="canvas-source-issue-action"
                onClick={() => onSyncLatest(layout)}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Update to latest
              </button>
            ) : null}
            <button
              className="canvas-source-issue-action"
              onClick={() => onKeepCurrent(layout)}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              {layout.status === "changed"
                ? "Keep old version"
                : "Keep current snapshot"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function sourceIssueMarkerShortLabel(marker: CanvasSourceIssueMarker): string {
  if (marker.status === "changed") {
    return "Old";
  }

  if (marker.status === "missing") {
    return "Missing";
  }

  return "Issue";
}

function sourceIssueMarkerTitle(marker: CanvasSourceIssueMarker): string {
  if (marker.status === "changed") {
    return "Source changed";
  }

  if (marker.status === "missing") {
    return "Source missing";
  }

  return "Source unsupported";
}

function sourceIssueMarkerDescription(marker: CanvasSourceIssueMarker): string {
  if (marker.status === "changed") {
    return "This canvas asset is using an older source snapshot.";
  }

  if (marker.status === "missing") {
    return "The source file is no longer available.";
  }

  return "The source cannot be rendered by this canvas plugin yet.";
}

function sameSourceIssueMarkerLayouts(
  left: readonly CanvasSourceIssueMarkerLayout[],
  right: readonly CanvasSourceIssueMarkerLayout[]
): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const candidate = right[index];
      return (
        Boolean(candidate) &&
        item.assetId === candidate?.assetId &&
        item.currentFingerprint === candidate?.currentFingerprint &&
        item.message === candidate?.message &&
        item.nodeId === candidate?.nodeId &&
        item.sourceAssetId === candidate?.sourceAssetId &&
        item.status === candidate?.status &&
        item.left === candidate?.left &&
        item.top === candidate?.top
      );
    })
  );
}
