import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useEffect,
} from "react";
import { parseCanvasDocument } from "../canvas/canvas-document";
import type {
  CanvasDocument,
  CanvasDocumentThumbnail,
} from "../canvas/canvas-document-types";
import {
  createCanvasSessionFromDocument,
  type CanvasSession,
  updateCanvasSessionThumbnail,
} from "../canvas/canvas-session";

declare global {
  interface Window {
    __blablaCanvasE2E?: {
      documentNodeCount(): number;
      failNextDocumentImageDrop(
        stage: "attachment" | "dirty" | "save",
        message: string,
      ): void;
      setDocument(payload: unknown): Promise<void>;
      setThumbnail(payload: unknown): Promise<void>;
    };
  }
}

export function useCanvasE2EDocumentHook(input: {
  autosaveTimeoutRef: RefObject<number | null>;
  documentWriteFailureRef: RefObject<{
    message: string;
    stage: "attachment" | "dirty" | "save";
  } | null>;
  saveDocument(document: CanvasDocument): Promise<void>;
  sessionRef: RefObject<CanvasSession | null>;
  setSession: Dispatch<SetStateAction<CanvasSession | null>>;
}): void {
  useEffect(() => {
    if (import.meta.env.VITE_BLABLA_CANVAS_E2E !== "1") {
      return undefined;
    }

    const e2e = {
      documentNodeCount: () =>
        input.sessionRef.current?.scene.nodes.length ?? 0,
      failNextDocumentImageDrop: (
        stage: "attachment" | "dirty" | "save",
        message: string,
      ) => {
        input.documentWriteFailureRef.current = { message, stage };
      },
      setDocument: async (payload: unknown) => {
        const document = parseCanvasDocument(payload);
        clearAutosaveTimeout(input.autosaveTimeoutRef);
        input.setSession(createCanvasSessionFromDocument(document));
        await input.saveDocument(document);
      },
      setThumbnail: async (payload: unknown) => {
        const thumbnail = parseCanvasDocumentThumbnail(payload);
        const current = input.sessionRef.current;
        if (!current) {
          throw new Error("Canvas session is unavailable for thumbnail e2e.");
        }

        const next = updateCanvasSessionThumbnail(current, thumbnail);
        clearAutosaveTimeout(input.autosaveTimeoutRef);
        input.setSession(next);
      },
    };

    window.__blablaCanvasE2E = e2e;
    return () => {
      if (window.__blablaCanvasE2E === e2e) {
        delete window.__blablaCanvasE2E;
      }
    };
  }, [
    input.autosaveTimeoutRef,
    input.documentWriteFailureRef,
    input.saveDocument,
    input.sessionRef,
    input.setSession,
  ]);
}

function parseCanvasDocumentThumbnail(value: unknown): CanvasDocumentThumbnail {
  if (!(typeof value === "object" && value !== null && !Array.isArray(value))) {
    throw new Error("Canvas thumbnail payload is not an object.");
  }
  const record = value as Record<string, unknown>;
  if (
    !(
      (record.fileName === undefined || typeof record.fileName === "string") &&
      typeof record.height === "number" &&
      record.mime === "image/webp" &&
      typeof record.updatedAt === "number" &&
      typeof record.width === "number"
    )
  ) {
    throw new Error("Canvas thumbnail payload is invalid.");
  }

  return {
    ...(record.fileName ? { fileName: record.fileName } : {}),
    height: record.height,
    mime: record.mime,
    updatedAt: record.updatedAt,
    width: record.width,
  };
}

function clearAutosaveTimeout(timeoutRef: RefObject<number | null>): void {
  if (timeoutRef.current !== null) {
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}
