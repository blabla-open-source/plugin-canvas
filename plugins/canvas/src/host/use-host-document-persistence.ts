import { useCallback, useMemo } from "react";
import {
  CanvasDocumentSaveOwner,
  queueLatestCanvasDocumentSave,
} from "../canvas/canvas-document-save-owner";
import type { CanvasDocument } from "../canvas/canvas-document-types";
import { serializeCanvasDocumentToJsonCanvas } from "../canvas/json-canvas-document";
import {
  canvasSessionToDocument,
  type CanvasSession,
} from "../canvas/canvas-session";
import type {
  BlablaHostBridge,
  BlablaHostSourceTextRevision,
} from "./host-api";

interface MutableValue<T> {
  current: T;
}

interface UseCanvasDocumentPersistenceInput {
  beforeSetDirty?: () => void;
  beforeWriteSourceTextWithAttachments?: () => void;
  contentRevisionRef: MutableValue<number>;
  hostBridgeRef: MutableValue<BlablaHostBridge | null>;
  onDirtySyncError?: (error: unknown) => void;
  sessionRef: MutableValue<CanvasSession | null>;
  sourceRevisionRef: MutableValue<BlablaHostSourceTextRevision | undefined>;
  sourceTextBaselineRef: MutableValue<string | null>;
}

export function useCanvasDocumentPersistence({
  beforeSetDirty,
  beforeWriteSourceTextWithAttachments,
  contentRevisionRef,
  hostBridgeRef,
  onDirtySyncError = (error) =>
    console.warn("[canvas] failed to sync dirty state:", error),
  sessionRef,
  sourceRevisionRef,
  sourceTextBaselineRef,
}: UseCanvasDocumentPersistenceInput) {
  const owner = useMemo(() => new CanvasDocumentSaveOwner(), []);
  const saveDocument = useCallback(
    async (document: CanvasDocument) => {
      const hostBridge = requiredHostBridge(hostBridgeRef.current);
      const content = serializeCanvasDocumentToJsonCanvas(document);
      const contentRevision = contentRevisionRef.current;
      beforeWriteSourceTextWithAttachments?.();
      const result = await hostBridge.document.writeSourceTextWithAttachments({
        content,
        expectedSourceRevision: sourceRevisionRef.current,
      });
      if (result.status === "conflict") {
        throw new Error("Canvas source changed on disk before save.");
      }
      sourceRevisionRef.current = result.document.sourceRevision;
      sourceTextBaselineRef.current = content;
      try {
        beforeSetDirty?.();
        await hostBridge.surface.setDirty({
          dirty: false,
          revision: contentRevision,
        });
      } catch (error) {
        onDirtySyncError(error);
      }
      return contentRevision;
    },
    [beforeSetDirty, beforeWriteSourceTextWithAttachments, onDirtySyncError],
  );
  const saveThumbnail = useCallback(
    (thumbnail: { dataUrl: string; height: number; width: number }) =>
      requiredHostBridge(hostBridgeRef.current).document.saveThumbnail(
        thumbnail,
      ),
    [],
  );
  const saveDocumentIfChanged = useCallback(
    (document: CanvasDocument) =>
      sourceTextBaselineRef.current ===
      serializeCanvasDocumentToJsonCanvas(document)
        ? Promise.resolve(null)
        : saveDocument(document),
    [saveDocument],
  );
  const queueDocumentSave = useCallback(
    () =>
      queueLatestCanvasDocumentSave({
        current: () => {
          const current = sessionRef.current;
          return current ? canvasSessionToDocument(current) : null;
        },
        currentRevision: () => contentRevisionRef.current,
        owner,
        saveIfChanged: saveDocumentIfChanged,
      }),
    [owner, saveDocumentIfChanged, sessionRef],
  );
  const replaceDocument = useCallback(
    (document: CanvasDocument) =>
      owner.run(async () => {
        const hostBridge = requiredHostBridge(hostBridgeRef.current);
        await hostBridge.document.rename({ title: document.name });
        sourceRevisionRef.current = (
          await hostBridge.document.readSourceText()
        ).sourceRevision;
        await saveDocument(document);
      }),
    [owner, saveDocument],
  );

  return {
    owner,
    queueDocumentSave,
    replaceDocument,
    saveDocument,
    saveDocumentIfChanged,
    saveThumbnail,
  };
}

function requiredHostBridge(
  hostBridge: BlablaHostBridge | null,
): BlablaHostBridge {
  if (!hostBridge) {
    throw new Error("Canvas host bridge is unavailable.");
  }
  return hostBridge;
}
