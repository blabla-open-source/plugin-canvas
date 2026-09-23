import type { CanvasWheelInput } from "./leafer-viewport";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import { visibleCanvasInsertionClientPoint } from "./canvas-insertion-point";
import {
  LeaferCanvasRuntime,
} from "./leafer-runtime";
import type { CanvasElementClientRect } from "./leafer-runtime-geometry";
import {
  updateGroupLayout,
  updateNodeLayout,
  updateTextDocumentObstacle,
  type CanvasGroupLayout,
  type CanvasNodeLayout,
  type CanvasNodeLayoutChange
} from "./scene-store";
import type { CanvasSceneTargets } from "./canvas-scene-targets";
import type {
  CanvasAsset,
  CanvasPoint,
  CanvasScene,
  CanvasViewport
} from "./types";

const LEAFER_TRANSFORM_HISTORY_CAPTURE_ID = "leafer-transform";
const TEXT_DOCUMENT_OBSTACLE_HISTORY_CAPTURE_ID = "text-document-obstacle";

export interface CanvasHostHandle {
  clientToCanvasPoint(clientX: number, clientY: number): CanvasPoint;
  elementClientRect(nodeId: string): CanvasElementClientRect | null;
  forwardWheel(input: CanvasWheelInput): void;
  isVideoPlaybackActive(nodeId: string): boolean;
  selectedTargets(): CanvasSceneTargets;
  toggleVideoPlayback(nodeId: string, asset: CanvasAsset): boolean;
  visibleInsertionPoint(): CanvasPoint;
}

export interface CanvasHostContextMenuRequest {
  clientX: number;
  clientY: number;
  targets: CanvasSceneTargets;
}

export type CanvasRuntimeDisposeHandler = (afterDispose: () => void) => void;

export interface CanvasHostProps {
  onContextMenuRequest?: (request: CanvasHostContextMenuRequest) => void;
  onDuplicateSelection: () => void;
  onHistoryCaptureEnd?: (captureId: string) => void;
  onHistoryCaptureStart?: (captureId: string) => void;
  onRegisterRuntimeDispose?: (
    handler: CanvasRuntimeDisposeHandler | null
  ) => void;
  onRedo: () => void;
  onModelToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onRemoteVideoToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onRemoveSelection: () => void;
  onSceneChange: (
    updater: (scene: CanvasScene) => CanvasScene,
    options?: { capture?: "ignore" | "record"; thumbnail?: "ignore" | "record" }
  ) => void;
  onUndo: () => void;
  onViewportChange: (viewport: CanvasViewport) => void;
  scene: CanvasScene;
  viewport: CanvasViewport;
}

interface CanvasHostRuntimeCallbacks {
  onHistoryCaptureEnd?: (captureId: string) => void;
  onHistoryCaptureStart?: (captureId: string) => void;
  onModelToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onRemoteVideoToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onSceneChange: CanvasHostProps["onSceneChange"];
  onViewportChange: (viewport: CanvasViewport) => void;
}

export const CanvasHost = forwardRef<CanvasHostHandle, CanvasHostProps>(
  function CanvasHost(
    {
      onContextMenuRequest,
      onDuplicateSelection,
      onHistoryCaptureEnd,
      onHistoryCaptureStart,
      onRegisterRuntimeDispose,
      onRedo,
      onModelToggle,
      onRemoteVideoToggle,
      onRemoveSelection,
      onSceneChange,
      onUndo,
      onViewportChange,
      scene,
      viewport
    },
    ref
  ) {
    const sceneRef = useRef(scene);
    const runtimeRef = useRef<LeaferCanvasRuntime | null>(null);
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<HTMLDivElement | null>(null);
    const initialViewportRef = useRef(viewport);
    const runtimeCallbacksRef = useRef<CanvasHostRuntimeCallbacks>({
      onHistoryCaptureEnd,
      onHistoryCaptureStart,
      onModelToggle,
      onRemoteVideoToggle,
      onSceneChange,
      onViewportChange
    });
    const afterRuntimeDisposeRef = useRef<(() => void) | null>(null);
    runtimeCallbacksRef.current = {
      onHistoryCaptureEnd,
      onHistoryCaptureStart,
      onModelToggle,
      onRemoteVideoToggle,
      onSceneChange,
      onViewportChange
    };

    useImperativeHandle(ref, () => ({
      clientToCanvasPoint(clientX, clientY) {
        return (
          runtimeRef.current?.clientToCanvasPoint(clientX, clientY) ?? {
            x: 0,
            y: 0
          }
        );
      },
      elementClientRect(nodeId) {
        return runtimeRef.current?.getElementClientRect(nodeId) ?? null;
      },
      forwardWheel(input) {
        runtimeRef.current?.forwardWheel(input);
      },
      isVideoPlaybackActive(nodeId) {
        return runtimeRef.current?.isVideoPlaybackActive(nodeId) ?? false;
      },
      selectedTargets() {
        return (
          runtimeRef.current?.selectedTargets() ?? {
            groupIds: [],
            nodeIds: []
          }
        );
      },
      toggleVideoPlayback(nodeId, asset) {
        return runtimeRef.current?.toggleVideoPlayback(nodeId, asset) ?? false;
      },
      visibleInsertionPoint() {
        const surface = surfaceRef.current;
        const clientPoint = surface
          ? visibleCanvasInsertionClientPoint(surface)
          : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

        return (
          runtimeRef.current?.clientToCanvasPoint(
            clientPoint.x,
            clientPoint.y
          ) ?? { x: 0, y: 0 }
        );
      }
    }));

    const prepareRuntimeDispose = useCallback((afterDispose: () => void) => {
      afterRuntimeDisposeRef.current = afterDispose;
    }, []);

    useEffect(() => {
      onRegisterRuntimeDispose?.(prepareRuntimeDispose);
      return () => {
        onRegisterRuntimeDispose?.(null);
      };
    }, [onRegisterRuntimeDispose, prepareRuntimeDispose]);

    useEffect(() => {
      sceneRef.current = scene;
      runtimeRef.current?.sync(scene);
    }, [scene]);

    useEffect(() => {
      const view = viewRef.current;

      if (!view) {
        return undefined;
      }

      const runtime = new LeaferCanvasRuntime(
        view,
        (nodeId: string, layout: CanvasNodeLayout, transient: boolean) => {
          runtimeCallbacksRef.current.onSceneChange(
            (current) => updateNodeLayout(current, nodeId, layout),
            {
              capture: transient ? "ignore" : "record",
              thumbnail: transient ? "ignore" : "record"
            }
          );
        },
        {
          initialViewport: initialViewportRef.current,
          onEditorTransformEnd: () => {
            runtimeCallbacksRef.current.onHistoryCaptureEnd?.(
              LEAFER_TRANSFORM_HISTORY_CAPTURE_ID
            );
          },
          onEditorTransformStart: () => {
            runtimeCallbacksRef.current.onHistoryCaptureStart?.(
              LEAFER_TRANSFORM_HISTORY_CAPTURE_ID
            );
          },
          onGroupLayout: (
            groupId: string,
            layout: CanvasGroupLayout,
            nodeLayouts: readonly CanvasNodeLayoutChange[],
            transient: boolean
          ) => {
            runtimeCallbacksRef.current.onSceneChange(
              (current) =>
                updateGroupLayout(current, groupId, layout, nodeLayouts),
              {
                capture: transient ? "ignore" : "record",
                thumbnail: transient ? "ignore" : "record"
              }
            );
          },
          onModelToggle: (nodeId, asset) => {
            runtimeCallbacksRef.current.onModelToggle?.(nodeId, asset);
          },
          onRemoteVideoToggle: (nodeId, asset) => {
            runtimeCallbacksRef.current.onRemoteVideoToggle?.(nodeId, asset);
          },
          onTextDocumentObstacleLayout: (nodeId, obstacle, transient) => {
            runtimeCallbacksRef.current.onSceneChange(
              (current) =>
                updateTextDocumentObstacle(current, nodeId, obstacle),
              {
                capture: transient ? "ignore" : "record",
                thumbnail: transient ? "ignore" : "record"
              }
            );
          },
          onTextDocumentObstacleTransformEnd: () => {
            runtimeCallbacksRef.current.onHistoryCaptureEnd?.(
              TEXT_DOCUMENT_OBSTACLE_HISTORY_CAPTURE_ID
            );
          },
          onTextDocumentObstacleTransformStart: () => {
            runtimeCallbacksRef.current.onHistoryCaptureStart?.(
              TEXT_DOCUMENT_OBSTACLE_HISTORY_CAPTURE_ID
            );
          },
          onViewportChange: (nextViewport) => {
            runtimeCallbacksRef.current.onViewportChange(nextViewport);
          }
        }
      );

      runtime.sync(sceneRef.current);
      runtimeRef.current = runtime;

      return () => {
        runtimeCallbacksRef.current.onViewportChange(runtime.getViewport());
        const afterRuntimeDispose = afterRuntimeDisposeRef.current;
        afterRuntimeDisposeRef.current = null;

        runtime.destroy();

        if (runtimeRef.current === runtime) {
          runtimeRef.current = null;
        }

        afterRuntimeDispose?.();
      };
    }, []);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const modifier = event.metaKey || event.ctrlKey;

      if (!modifier) {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          onRemoveSelection();
        }
        return;
      }

      if (event.key.toLowerCase() === "z" && event.shiftKey) {
        event.preventDefault();
        onRedo();
        return;
      }

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        onUndo();
        return;
      }

      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        onDuplicateSelection();
      }
    };

    const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
      if (!onContextMenuRequest) {
        return;
      }

      event.preventDefault();
      surfaceRef.current?.focus();
      onContextMenuRequest({
        clientX: event.clientX,
        clientY: event.clientY,
        targets: runtimeRef.current?.selectedTargets() ?? {
          groupIds: [],
          nodeIds: []
        }
      });
    };

    return (
      <div
        className="canvas-surface"
        onContextMenuCapture={handleContextMenu}
        onKeyDown={handleKeyDown}
        ref={surfaceRef}
        tabIndex={0}
      >
        <div
          className="canvas-dot-grid"
          data-testid="canvas-dot-grid"
          style={dotGridStyle(viewport)}
        />
        <div className="canvas-leafer-layer" data-testid="leafer-canvas">
          <div className="canvas-view" ref={viewRef} />
        </div>
      </div>
    );
  }
);

const DOT_GRID_BASE_PX = 20;
const DOT_GRID_HIDE_OPACITY = 0.01;
const DOT_GRID_MAX_OPACITY = 0.18;

function dotGridStyle(viewport: CanvasViewport): CSSProperties {
  const gridSize = DOT_GRID_BASE_PX * viewport.zoom;
  const opacity = Math.max(
    0,
    Math.min(DOT_GRID_MAX_OPACITY, (gridSize - 6) / 60)
  );
  const opacityPercentage = `${Math.round(opacity * 100)}%`;
  const scaledOpacityPercentage = `min(calc(${opacityPercentage} * var(--lm-canvas-dot-grid-opacity-scale, 1)), ${Math.round(
    DOT_GRID_MAX_OPACITY * 100
  )}%)`;

  return {
    backgroundImage:
      opacity < DOT_GRID_HIDE_OPACITY
        ? "none"
        : `radial-gradient(circle, color-mix(in srgb, var(--foreground) ${scaledOpacityPercentage}, transparent) 1px, transparent 1px)`,
    backgroundPosition: `${viewport.x % gridSize}px ${viewport.y % gridSize}px`,
    backgroundSize: `${gridSize}px ${gridSize}px`
  };
}
