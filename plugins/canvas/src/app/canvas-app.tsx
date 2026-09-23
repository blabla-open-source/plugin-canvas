import { fileReferenceToPromotedCanvasAsset } from "../host/host-file-reference-promoted-asset";
import { acknowledgeCanvasAssetSourceIssue } from "../canvas/scene-store";
import {
  type DragEvent as ReactDragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CanvasHost,
  type CanvasHostContextMenuRequest,
  type CanvasHostHandle,
} from "../canvas/canvas-host";
import {
  parseJsonCanvasText,
  serializeCanvasDocumentToJsonCanvas,
} from "../canvas/json-canvas-document";
import { useCanvasE2EDocumentHook } from "./canvas-e2e-document-hook";
import {
  type CanvasAssetContextMenuAction,
  type CanvasAssetContextMenuModel,
  buildCanvasAssetContextMenuModel,
  canvasAssetContextMenuPosition,
} from "../canvas/canvas-asset-context-menu-model";
import { CanvasAssetContextMenu } from "../canvas/canvas-asset-context-menu";
import { createPromotedCanvasAssetPatch } from "../canvas/canvas-asset-placement";
import {
  mergeScene,
  updatePromotedCanvasAssetPreview,
} from "../canvas/canvas-scene-promoted-assets";
import {
  beginCanvasSessionHistoryCapture,
  canvasSessionToDocument,
  commitCanvasSessionHistoryCapture,
  createCanvasSessionFromDocument,
  redoCanvasSession,
  type CanvasSession,
  undoCanvasSession,
  updateCanvasSessionScene,
  updateCanvasSessionThumbnail,
  updateCanvasSessionViewport,
} from "../canvas/canvas-session";
import {
  ModelCanvasOverlay,
  RemoteVideoCanvasOverlay,
  type ModelOverlayState,
  type RemoteVideoOverlayState,
} from "../canvas/canvas-media-overlays";
import {
  duplicateSceneTargets,
  hasCanvasSceneTargets,
  removeSceneTargets,
  type CanvasSceneTargets,
} from "../canvas/canvas-scene-targets";
import {
  nextCanvasSceneTopLevelZ,
  reorderSceneTargets,
  type CanvasSceneReorderOperation,
} from "../canvas/canvas-scene-reorder";
import { CanvasSourceIssueMarkers } from "../canvas/canvas-source-issue-markers";
import { useCanvasSourceStatus } from "../canvas/use-canvas-source-status";
import { useCanvasThumbnailFlush } from "../canvas/use-canvas-thumbnail-flush";
import type { CanvasPoint, CanvasScene, CanvasViewport } from "../canvas/types";
import {
  BLABLA_FILE_REFERENCE_DRAG_MIME,
  type BlablaHostBridge,
  type BlablaHostFileReference,
  type BlablaHostSourceTextRevision,
  fileReferenceToCanvasContextReference,
  fileReferenceDragIdsFromDataTransfer,
  fileReferenceToCanvasSourceReference,
  mergeFileReferenceRecords,
  removeFileReferenceRecords,
} from "../host/host-api";
import { useCanvasSourceIssueActions } from "../host/use-canvas-source-issue-actions";
import { refreshSceneFromHostFileReferences } from "../host/host-file-reference-scene-refresh";
import { resolveJsonCanvasFileReferences } from "../host/json-canvas-file-references";
import { useCanvasDocumentImages } from "../host/use-host-document-images";
import { useHostCanvasSceneCommit } from "../host/use-host-canvas-scene-commit";
import { useCanvasDocumentPersistence } from "../host/use-host-document-persistence";
import { useHostContentPreservation } from "../host/use-host-content-preservation";
import {
  applyBlablaHostSurface,
  applyBlablaHostTheme,
} from "../host/host-theme";

interface CanvasContextMenuState {
  model: CanvasAssetContextMenuModel;
  targets: CanvasSceneTargets;
  x: number;
  y: number;
}

const CANVAS_THUMBNAIL_FALLBACK_SIZE = {
  height: 480,
  width: 360,
};
const EMPTY_RUNTIME_SCENE: CanvasScene = {
  assets: {},
  groups: {},
  nodes: [],
};

export function CanvasApp() {
  const hostContentRevisionRef = useRef(0);
  const hostBridgeRef = useRef<BlablaHostBridge | null>(null);
  const hostSourceRevisionRef = useRef<
    BlablaHostSourceTextRevision | undefined
  >(undefined);
  const hostSourceTextBaselineRef = useRef<string | null>(null);
  const hostRef = useRef<CanvasHostHandle | null>(null);
  const autosaveTimeoutRef = useRef<number | null>(null);
  const documentWriteFailureRef = useRef<{
    message: string;
    stage: "attachment" | "dirty" | "save";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<CanvasSession | null>(null);
  const sessionRef = useRef<CanvasSession | null>(null);
  sessionRef.current = session;
  const {
    owner: documentSaveOwner,
    queueDocumentSave,
    replaceDocument,
    saveDocument,
    saveDocumentIfChanged,
    saveThumbnail,
  } = useCanvasDocumentPersistence({
    beforeSetDirty: () =>
      consumeDocumentWriteFailure(documentWriteFailureRef, "dirty"),
    beforeWriteSourceTextWithAttachments: () =>
      consumeDocumentWriteFailure(documentWriteFailureRef, "save"),
    contentRevisionRef: hostContentRevisionRef,
    hostBridgeRef,
    onDirtySyncError: (dirtyError) => setError(errorMessage(dirtyError)),
    sessionRef,
    sourceRevisionRef: hostSourceRevisionRef,
    sourceTextBaselineRef: hostSourceTextBaselineRef,
  });
  const [hostBridge, setHostBridge] = useState<BlablaHostBridge | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fileReferencesById, setFileReferencesById] = useState<
    Record<string, BlablaHostFileReference>
  >({});
  const [contextMenu, setContextMenu] = useState<CanvasContextMenuState | null>(
    null,
  );
  const [remoteVideoOverlay, setRemoteVideoOverlay] =
    useState<RemoteVideoOverlayState | null>(null);
  const [modelOverlay, setModelOverlay] = useState<ModelOverlayState | null>(
    null,
  );
  const sceneRef = useRef<CanvasScene | null>(null);
  const thumbnailSceneRef = useRef<CanvasScene | null>(null);
  sceneRef.current = session?.scene ?? null;
  useHostContentPreservation({
    autosaveTimeoutRef,
    contentRevisionRef: hostContentRevisionRef,
    hostBridge,
    hostBridgeRef,
    loaded,
    onError: setError,
    queueDocumentSave,
    session,
    sessionRef,
    sourceTextBaselineRef: hostSourceTextBaselineRef,
  });
  const sourceAssetIdKey = session?.sourceAssetIds.join("\0") ?? "";
  const sourceReferences = useMemo(
    () =>
      Object.values(fileReferencesById).map(
        fileReferenceToCanvasSourceReference,
      ),
    [fileReferencesById],
  );
  const contextReferences = useMemo(
    () =>
      Object.values(fileReferencesById).map(
        fileReferenceToCanvasContextReference,
      ),
    [fileReferencesById],
  );
  const {
    issueMarkers: sourceIssueMarkers,
    referencesForStatus,
    runtimeScene,
  } = useCanvasSourceStatus({
    scene: session?.scene ?? EMPTY_RUNTIME_SCENE,
    sourceReferences: hostBridge ? sourceReferences : undefined,
  });
  thumbnailSceneRef.current = session ? runtimeScene : null;

  const applySceneChange = useCallback(
    (
      updater: (scene: CanvasScene) => CanvasScene,
      options?: {
        capture?: "ignore" | "record";
        thumbnail?: "ignore" | "record";
      },
    ) => {
      setContextMenu(null);
      setRemoteVideoOverlay(null);
      setModelOverlay(null);
      setSession((current) =>
        current ? updateCanvasSessionScene(current, updater, options) : current,
      );
    },
    [],
  );

  const fallbackCanvasInsertionPoint = useCallback(
    (): CanvasPoint =>
      hostRef.current?.visibleInsertionPoint() ??
      hostRef.current?.clientToCanvasPoint(
        window.innerWidth / 2,
        window.innerHeight / 2,
      ) ?? { x: 0, y: 0 },
    [],
  );

  const commitSceneChange = useHostCanvasSceneCommit({
    onError: setError,
    owner: documentSaveOwner,
    saveDocument,
    sessionRef,
    setSession,
  });

  const flushThumbnail = useCanvasThumbnailFlush({
    onThumbnailChange: useCallback(
      async (thumbnail) => {
        if (autosaveTimeoutRef.current !== null) {
          window.clearTimeout(autosaveTimeoutRef.current);
          autosaveTimeoutRef.current = null;
        }
        await documentSaveOwner.run(async () => {
          const currentSession = sessionRef.current;
          if (currentSession) {
            await saveDocumentIfChanged(
              canvasSessionToDocument(currentSession),
            );
          }
          const savedThumbnail = await saveThumbnail(thumbnail);
          setSession((current) =>
            current
              ? updateCanvasSessionThumbnail(current, savedThumbnail)
              : current,
          );
        });
      },
      [documentSaveOwner, saveDocumentIfChanged, saveThumbnail],
    ),
    sceneRef: thumbnailSceneRef,
    thumbnail: session?.thumbnail,
    thumbnailFallbackSize: CANVAS_THUMBNAIL_FALLBACK_SIZE,
    thumbnailRevision: session?.thumbnailRevision ?? 0,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const hostBridge = window.blablaHost;
        if (!hostBridge) {
          throw new Error("Canvas host bridge is unavailable.");
        }
        hostBridgeRef.current = hostBridge;
        setHostBridge(hostBridge);
        const [context, record, theme] = await Promise.all([
          hostBridge.context.get(),
          hostBridge.document.readSourceText(),
          hostBridge.appearance.getTheme(),
        ]);
        const document = parseJsonCanvasText(record.content, {
          documentId: context.documentId,
          name: record.title,
          sourcePath: record.sourcePath,
        });
        const resolvedDocument = await resolveJsonCanvasFileReferences(
          document,
          hostBridge,
        );

        if (cancelled) {
          return;
        }

        applyBlablaHostSurface(context);
        applyBlablaHostTheme(theme);
        hostSourceRevisionRef.current = record.sourceRevision;
        hostSourceTextBaselineRef.current = serializeCanvasDocumentToJsonCanvas(
          resolvedDocument.document,
        );
        setFileReferencesById((current) =>
          mergeFileReferenceRecords(current, resolvedDocument.references),
        );
        setSession(createCanvasSessionFromDocument(resolvedDocument.document));
        setLoaded(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hostBridge) {
      return undefined;
    }

    const changed = hostBridge.fileReferences.onChanged((event) => {
      setFileReferencesById((current) =>
        mergeFileReferenceRecords(
          removeFileReferenceRecords(current, event.removedReferenceIds),
          event.references,
        ),
      );
      applySceneChange(
        (scene) => refreshSceneFromHostFileReferences(scene, event.references),
        { capture: "ignore" },
      );
    });

    return () => {
      changed.dispose();
    };
  }, [applySceneChange, hostBridge]);

  useEffect(() => {
    if (!hostBridge) {
      return undefined;
    }

    const themeChanged = hostBridge.events.on("theme.changed", (event) => {
      applyBlablaHostTheme(event.theme);
    });

    return () => {
      themeChanged.dispose();
    };
  }, [hostBridge]);

  useEffect(() => {
    if (!hostBridge) {
      return undefined;
    }

    const sourceAssetIds = sessionRef.current?.sourceAssetIds ?? [];
    let cancelled = false;
    void hostBridge.fileReferences.setSourceWatchIds(sourceAssetIds);

    if (sourceAssetIds.length > 0) {
      hostBridge.fileReferences
        .readByIds(sourceAssetIds)
        .then((references) => {
          if (!cancelled) {
            setFileReferencesById((current) =>
              mergeFileReferenceRecords(current, references),
            );
            applySceneChange(
              (scene) => refreshSceneFromHostFileReferences(scene, references),
              { capture: "ignore" },
            );
          }
        })
        .catch((fileReferenceError) => {
          if (!cancelled) {
            setError(
              fileReferenceError instanceof Error
                ? fileReferenceError.message
                : String(fileReferenceError),
            );
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [applySceneChange, hostBridge, sourceAssetIdKey]);

  useCanvasE2EDocumentHook({
    autosaveTimeoutRef,
    documentWriteFailureRef,
    saveDocument: replaceDocument,
    sessionRef,
    setSession,
  });

  useEffect(() => {
    if (!loaded || !session) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void flushThumbnail().catch((thumbnailError) => {
        setError(
          thumbnailError instanceof Error
            ? thumbnailError.message
            : String(thumbnailError),
        );
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [flushThumbnail, loaded, session?.thumbnailRevision]);

  const removeTargets = useCallback(
    (targets: CanvasSceneTargets) => {
      applySceneChange((current) => removeSceneTargets(current, targets));
    },
    [applySceneChange],
  );

  const handleViewportChange = useCallback((viewport: CanvasViewport) => {
    setSession((current) =>
      current ? updateCanvasSessionViewport(current, viewport) : current,
    );
  }, []);

  const beginHistoryCapture = useCallback((captureId: string) => {
    setSession((current) =>
      current ? beginCanvasSessionHistoryCapture(current, captureId) : current,
    );
  }, []);

  const commitHistoryCapture = useCallback((captureId: string) => {
    setSession((current) =>
      current ? commitCanvasSessionHistoryCapture(current, captureId) : current,
    );
  }, []);

  const addFileReferencesToCanvas = useCallback(
    (
      references: readonly BlablaHostFileReference[],
      point = fallbackCanvasInsertionPoint(),
    ) => {
      if (references.length === 0) {
        return;
      }

      applySceneChange((scene) =>
        mergeScene(
          scene,
          createPromotedCanvasAssetPatch({
            point,
            promotedAssets: references.map((reference) =>
              fileReferenceToPromotedCanvasAsset(reference),
            ),
            startZ: nextCanvasSceneTopLevelZ(scene),
          }),
        ),
      );
    },
    [applySceneChange, fallbackCanvasInsertionPoint],
  );

  const addDocumentImagesToCanvas = useCanvasDocumentImages({
    beforeWriteAttachment: () =>
      consumeDocumentWriteFailure(documentWriteFailureRef, "attachment"),
    commitSceneChange,
    fallbackPoint: fallbackCanvasInsertionPoint,
    hostBridgeRef,
    loaded,
    onError: setError,
  });

  const addFileReferenceIdsToCanvas = useCallback(
    async (referenceIds: readonly string[], point?: CanvasPoint) => {
      const hostBridge = hostBridgeRef.current;
      const uniqueReferenceIds = uniqueStrings(referenceIds);
      if (!(hostBridge && uniqueReferenceIds.length > 0)) {
        return;
      }

      const references =
        await hostBridge.fileReferences.readByIds(uniqueReferenceIds);
      setFileReferencesById((current) =>
        mergeFileReferenceRecords(current, references),
      );
      addFileReferencesToCanvas(references, point);
    },
    [addFileReferencesToCanvas],
  );

  useEffect(() => {
    if (!hostBridge) {
      return undefined;
    }

    const add = hostBridge.events.on("surface.fileReferences.add", (event) => {
      const point =
        typeof event.clientX === "number" && typeof event.clientY === "number"
          ? hostRef.current?.clientToCanvasPoint(event.clientX, event.clientY)
          : undefined;
      addFileReferenceIdsToCanvas(event.referenceIds, point).catch(
        (fileReferenceError) => {
          setError(errorMessage(fileReferenceError));
        },
      );
    });
    const addFiles = hostBridge.events.on(
      "surface.files.add",
      async (event) => {
        const point =
          typeof event.clientX === "number" && typeof event.clientY === "number"
            ? hostRef.current?.clientToCanvasPoint(event.clientX, event.clientY)
            : undefined;
        const images = event.items.filter((item) =>
          item.mime.startsWith("image/"),
        );
        if (images.length !== event.items.length || images.length === 0) {
          throw new Error("Canvas accepts only image files in this drop.");
        }
        try {
          await addDocumentImagesToCanvas(images, point);
        } catch (fileError) {
          setError(errorMessage(fileError));
          throw fileError;
        }
      },
    );

    return () => {
      add.dispose();
      addFiles.dispose();
    };
  }, [addDocumentImagesToCanvas, addFileReferenceIdsToCanvas, hostBridge]);

  const handleCanvasDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!hostBridge) {
        return;
      }
      if (!hasFileReferenceDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [hostBridge],
  );

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!hostBridge || !hasFileReferenceDropPayload(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const dropPoint = hostRef.current?.clientToCanvasPoint(
        event.clientX,
        event.clientY,
      );
      const payloadReferenceIds = fileReferenceDragIdsFromDataTransfer(
        event.dataTransfer,
      );
      const referenceIdsPromise =
        payloadReferenceIds.length > 0
          ? Promise.resolve(payloadReferenceIds)
          : Promise.resolve([]);

      referenceIdsPromise
        .then((referenceIds) =>
          addFileReferenceIdsToCanvas(referenceIds, dropPoint),
        )
        .catch((fileReferenceError) => {
          setError(errorMessage(fileReferenceError));
        });
    },
    [addFileReferenceIdsToCanvas, hostBridge],
  );

  const applyToSelectedTargets = useCallback(
    (
      updater: (scene: CanvasScene, targets: CanvasSceneTargets) => CanvasScene,
    ) => {
      const targets = hostRef.current?.selectedTargets() ?? {
        groupIds: [],
        nodeIds: [],
      };
      if (!hasCanvasSceneTargets(targets)) {
        return;
      }

      applySceneChange((scene) => updater(scene, targets));
    },
    [applySceneChange],
  );

  const duplicateSelection = useCallback(() => {
    applyToSelectedTargets(
      (scene, targets) => duplicateSceneTargets(scene, targets).scene,
    );
  }, [applyToSelectedTargets]);

  const removeSelection = useCallback(() => {
    const targets = hostRef.current?.selectedTargets() ?? {
      groupIds: [],
      nodeIds: [],
    };
    if (!hasCanvasSceneTargets(targets)) {
      return;
    }

    removeTargets(targets);
  }, [removeTargets]);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".canvas-context-menu")
      ) {
        return;
      }

      setContextMenu(null);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleContextMenuRequest = useCallback(
    (request: CanvasHostContextMenuRequest) => {
      if (!session || !hasCanvasSceneTargets(request.targets)) {
        setContextMenu(null);
        return;
      }

      const model = buildCanvasAssetContextMenuModel(
        runtimeScene,
        request.targets,
        contextReferences,
        referencesForStatus,
        (nodeId) =>
          (hostRef.current?.isVideoPlaybackActive(nodeId) ?? false) ||
          remoteVideoOverlay?.nodeId === nodeId,
      );

      if (model.entries.length === 0) {
        setContextMenu(null);
        return;
      }

      setContextMenu({
        ...canvasAssetContextMenuPosition(request),
        model,
        targets: request.targets,
      });
    },
    [
      contextReferences,
      referencesForStatus,
      remoteVideoOverlay,
      runtimeScene,
      session,
    ],
  );

  const toggleRemoteVideoOverlay = useCallback(
    (nodeId: string, asset: CanvasScene["assets"][string]) => {
      const remoteVideo = asset.remoteVideo;
      if (!remoteVideo) {
        return;
      }

      setContextMenu(null);
      setModelOverlay(null);
      setRemoteVideoOverlay((current) =>
        current?.nodeId === nodeId
          ? null
          : {
              assetId: asset.id,
              name: asset.name,
              nodeId,
              remoteVideo,
            },
      );
    },
    [],
  );

  const toggleModelOverlay = useCallback(
    (nodeId: string, asset: CanvasScene["assets"][string]) => {
      if (!(asset.kind === "model" && asset.mediaUrl)) {
        return;
      }

      const mediaUrl = asset.mediaUrl;
      setContextMenu(null);
      setRemoteVideoOverlay(null);
      setModelOverlay((current) =>
        current?.nodeId === nodeId
          ? null
          : {
              assetId: asset.id,
              mediaUrl,
              name: asset.name,
              nodeId,
              sourceAssetId: asset.sourceAssetId,
            },
      );
    },
    [],
  );

  const performContextMenuAction = useCallback(
    (action: CanvasAssetContextMenuAction) => {
      const menu = contextMenu;
      if (!(menu && session)) {
        return;
      }

      switch (action) {
        case "acknowledge-source-issue": {
          const selected = menu.model.selection.singleNodeAsset;
          const issue = menu.model.selection.singleSourceIssue;
          if (selected && issue) {
            applySceneChange((scene) =>
              acknowledgeCanvasAssetSourceIssue(
                scene,
                selected.asset.id,
                issue,
              ),
            );
          }
          break;
        }
        case "duplicate-node":
          applySceneChange(
            (scene) => duplicateSceneTargets(scene, menu.targets).scene,
          );
          break;
        case "pause-video":
        case "play-video": {
          const selected = menu.model.selection.singleNodeAsset;
          if (
            !(
              selected &&
              hostRef.current?.toggleVideoPlayback(
                selected.node.id,
                selected.asset,
              )
            )
          ) {
            setError("Video playback is not available for this asset.");
          }
          break;
        }
        case "remove-from-canvas":
          removeTargets(menu.targets);
          break;
        case "open":
        case "open-remote-page": {
          const reference = menu.model.selection.singleReference;
          const hostBridge = hostBridgeRef.current;
          if (reference && hostBridge) {
            void hostBridge.fileReferences
              .open(reference.id)
              .catch((openError) => setError(errorMessage(openError)));
          } else {
            setError("File reference is not available.");
          }
          break;
        }
        case "reveal": {
          const reference = menu.model.selection.singleReference;
          const hostBridge = hostBridgeRef.current;
          if (reference && hostBridge) {
            void hostBridge.fileReferences
              .reveal(reference.id)
              .catch((revealError) => setError(errorMessage(revealError)));
          } else {
            setError("File reference is not available.");
          }
          break;
        }
        case "sync-source": {
          const selected = menu.model.selection.singleNodeAsset;
          const reference = menu.model.selection.singleReference;
          const hostReference = reference
            ? fileReferencesById[reference.id]
            : undefined;
          if (selected && hostReference) {
            applySceneChange((scene) =>
              updatePromotedCanvasAssetPreview(
                scene,
                fileReferenceToPromotedCanvasAsset(hostReference, {
                  assetId: selected.asset.id,
                }),
              ),
            );
          } else {
            setError("File reference is not available.");
          }
          break;
        }
        case "bring-forward":
        case "bring-to-front":
        case "send-backward":
        case "send-to-back":
          break;
        default: {
          const exhaustive: never = action;
          throw new Error(
            `unsupported canvas context menu action: ${exhaustive}`,
          );
        }
      }

      setContextMenu(null);
    },
    [applySceneChange, contextMenu, fileReferencesById, removeTargets, session],
  );

  const performContextMenuLayerOperation = useCallback(
    (operation: CanvasSceneReorderOperation) => {
      const menu = contextMenu;
      if (!(menu && session)) {
        return;
      }

      applySceneChange((scene) =>
        reorderSceneTargets(scene, menu.targets, operation),
      );
      setContextMenu(null);
    },
    [applySceneChange, contextMenu, session],
  );

  const { keepSourceIssueCurrent, syncSourceIssueToLatest } = useCanvasSourceIssueActions(
    applySceneChange, fileReferencesById, setError
  );

  const undo = useCallback(() => {
    setSession((current) => (current ? undoCanvasSession(current) : current));
  }, []);

  const redo = useCallback(() => {
    setSession((current) => (current ? redoCanvasSession(current) : current));
  }, []);

  useEffect(() => {
    if (!hostBridge) {
      return undefined;
    }

    const command = hostBridge.events.on("surface.command", (event) => {
      if (event.command === "undo") {
        undo();
      } else if (event.command === "redo") {
        redo();
      }
    });

    return () => {
      command.dispose();
    };
  }, [hostBridge, redo, undo]);

  if (error && !session) {
    return <main className="canvas-error">{error}</main>;
  }

  if (!session) {
    return <main className="canvas-loading">Loading canvas...</main>;
  }

  return (
    <main
      className="canvas-app"
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      {error ? <div className="canvas-inline-error">{error}</div> : null}
      <CanvasAssetContextMenu
        menu={contextMenu}
        model={contextMenu?.model ?? null}
        onActionSelect={performContextMenuAction}
        onLayerSelect={performContextMenuLayerOperation}
      />
      {remoteVideoOverlay ? (
        <RemoteVideoCanvasOverlay
          hostRef={hostRef}
          interactive
          muted
          onClose={() => setRemoteVideoOverlay(null)}
          overlay={remoteVideoOverlay}
        />
      ) : null}
      {modelOverlay ? (
        <ModelCanvasOverlay
          hostRef={hostRef}
          interactive
          onClose={() => setModelOverlay(null)}
          overlay={modelOverlay}
        />
      ) : null}
      <CanvasHost
        onContextMenuRequest={handleContextMenuRequest}
        onDuplicateSelection={duplicateSelection}
        onHistoryCaptureEnd={commitHistoryCapture}
        onHistoryCaptureStart={beginHistoryCapture}
        onModelToggle={toggleModelOverlay}
        onRedo={redo}
        onRemoteVideoToggle={toggleRemoteVideoOverlay}
        onRemoveSelection={removeSelection}
        onSceneChange={applySceneChange}
        onUndo={undo}
        onViewportChange={handleViewportChange}
        ref={hostRef}
        scene={runtimeScene}
        viewport={session.viewport}
      />
      <CanvasSourceIssueMarkers
        hostRef={hostRef}
        markers={sourceIssueMarkers}
        onKeepCurrent={keepSourceIssueCurrent}
        onSyncLatest={syncSourceIssueToLatest}
        viewport={session.viewport}
      />
    </main>
  );
}

function consumeDocumentWriteFailure(
  failureRef: {
    current: {
      message: string;
      stage: "attachment" | "dirty" | "save";
    } | null;
  },
  stage: "attachment" | "dirty" | "save",
): void {
  const failure = failureRef.current;
  if (!failure || failure.stage !== stage) {
    return;
  }
  failureRef.current = null;
  throw new Error(failure.message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasFileReferenceDropPayload(
  dataTransfer: DataTransfer | null,
): boolean {
  const types = Array.from(dataTransfer?.types ?? []);
  return types.includes(BLABLA_FILE_REFERENCE_DRAG_MIME);
}

function uniqueStrings(values: readonly string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }
  return unique;
}
