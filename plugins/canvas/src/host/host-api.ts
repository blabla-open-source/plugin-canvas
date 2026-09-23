import type { CanvasAssetContextReference } from "../canvas/canvas-asset-context-menu-model";
import type { CanvasSourceReference } from "../canvas/canvas-source-status";
import type { AssetKind } from "../canvas/types";
import type {
  BlablaHostBridgeDocumentRecord,
  BlablaHostBridgeDocumentThumbnail,
  BlablaHostDocumentAttachment,
  BlablaHostSurfaceFileReferenceAddEvent,
  BlablaHostSurfaceFilesAddEvent,
} from "./host-document-api-types";
import type {
  BlablaHostLifecycleApi,
  BlablaHostSurfaceStateApi,
} from "./host-preservation-api-types";

export type {
  BlablaHostBridgeDocumentRecord,
  BlablaHostBridgeDocumentThumbnail,
  BlablaHostDocumentAttachment,
  BlablaHostSurfaceFileReferenceAddEvent,
  BlablaHostSurfaceFilesAddEvent,
} from "./host-document-api-types";

export interface BlablaHostBridgeContext {
  apiVersion: 1;
  capabilities: BlablaHostCapabilities;
  documentId: string;
  pluginId: string;
  surface: {
    background: BlablaHostSurfaceBackground;
  };
  surfaceId: string;
  surfaceInstanceId: string;
  tabId: string;
}

export interface BlablaHostCapabilities {
  documentAttachments: Array<"read" | "write">;
  documentMetadata: Array<"thumbnail:write" | "title:write">;
  fileReferences: Array<
    "import" | "open" | "quickView" | "read" | "reveal" | "watch"
  >;
  materials: Array<"prepare" | "read">;
  pluginDocument: Array<"read" | "write">;
  sourceText: Array<"read" | "write">;
  surface: Array<"dirty">;
}

export interface BlablaHostSourceTextRevision {
  kind: AssetKind;
  mime: string;
  mtime: number;
  size: number;
}

export interface BlablaHostSourceTextDocumentRecord {
  content: string;
  documentId: string;
  sourceMtime: number;
  sourcePath: string;
  sourceRevision: BlablaHostSourceTextRevision;
  sourceSize: number;
  surfaceId: string;
  title: string;
  updatedAt: number;
}

export type BlablaHostSourceTextWriteResult =
  | {
      document: BlablaHostSourceTextDocumentRecord;
      status: "saved";
    }
  | {
      diskDocument: BlablaHostSourceTextDocumentRecord;
      status: "conflict";
    };

export interface BlablaHostBridge {
  readonly apiVersion: 1;
  appearance: {
    getTheme(): Promise<BlablaHostThemeState>;
  };
  context: {
    get(): Promise<BlablaHostBridgeContext>;
  };
  document: {
    get(): Promise<BlablaHostBridgeDocumentRecord>;
    readSourceText(): Promise<BlablaHostSourceTextDocumentRecord>;
    rename(input: { title: string }): Promise<{ title: string }>;
    resolveAttachments(input: {
      files: string[];
    }): Promise<BlablaHostDocumentAttachment[]>;
    save(input: {
      expectedVersion?: number;
      payload: unknown;
    }): Promise<BlablaHostBridgeDocumentRecord>;
    saveThumbnail(input: {
      dataUrl: string;
      height: number;
      width: number;
    }): Promise<BlablaHostBridgeDocumentThumbnail>;
    writeSourceText(input: {
      content: string;
      expectedSourceRevision?: BlablaHostSourceTextRevision;
      overwrite?: boolean;
    }): Promise<BlablaHostSourceTextWriteResult>;
    writeSourceTextWithAttachments(input: {
      content: string;
      expectedSourceRevision?: BlablaHostSourceTextRevision;
      overwrite?: boolean;
    }): Promise<BlablaHostSourceTextWriteResult>;
    writeAttachment(input: {
      bytes: Uint8Array;
      mime: string;
      name: string;
    }): Promise<BlablaHostDocumentAttachment>;
  };
  events: {
    on<T extends BlablaHostEvent["kind"]>(
      kind: T,
      listener: (
        event: Extract<BlablaHostEvent, { kind: T }>,
      ) => Promise<void> | void
    ): BlablaHostDisposable;
  };
  fileReferences: {
    onChanged(
      listener: (event: BlablaHostFileReferenceChangeEvent) => void
    ): BlablaHostDisposable;
    onLibraryReset(listener: () => void): BlablaHostDisposable;
    open(id: string): Promise<{ ok: true }>;
    quickView(input: BlablaHostFileReferenceQuickViewInput): Promise<{ ok: true }>;
    readByIds(ids: string[]): Promise<BlablaHostFileReference[]>;
    reveal(id: string): Promise<{ ok: true }>;
    resolveDocumentFiles(input: {
      files: string[];
    }): Promise<
      Array<{
        file: string;
        reference: BlablaHostFileReference;
      }>
    >;
    setSourceWatchIds(ids: string[]): Promise<{ ok: true }>;
  };
  lifecycle: BlablaHostLifecycleApi<BlablaHostBridgeContext>;
  surface: BlablaHostSurfaceStateApi;
}

export const BLABLA_FILE_REFERENCE_DRAG_MIME =
  "application/x-app-file-reference-ids";

export interface BlablaHostDisposable {
  dispose(): void;
}

export interface BlablaHostFileReference {
  addedAt: number;
  byteSize: number;
  contentPreview?: string;
  duration?: number;
  height?: number;
  id: string;
  kind: AssetKind;
  largePreviewUrl: string | null;
  mime: string;
  missing: boolean;
  mtime: number;
  name: string;
  pageCount?: number;
  previewUrl: string | null;
  remoteVideo?: {
    provider?: string;
    thumbnailUrl?: string;
    title?: string;
    url: string;
  };
  sourceFingerprint?: string;
  sourceKind: "file" | "remote-video";
  sourcePath?: string;
  sourceStorageKind?: "external" | "library";
  sourceUrl: string | null;
  tags: string[];
  trashedAt?: number;
  width?: number;
}

export interface BlablaHostFileReferenceQuickViewInput {
  activation: "focus" | "show-inactive";
  activeId: string;
  orderedIds: string[];
}

export interface BlablaHostFileReferenceChangeEvent {
  change: "import" | "remove" | "restore" | "source" | "trash" | "update";
  kind: "fileReferences.changed";
  references: BlablaHostFileReference[];
  removedReferenceIds: string[];
}

export interface BlablaHostSurfaceCommandEvent {
  command: "redo" | "undo";
  kind: "surface.command";
}

export type BlablaHostThemeMode = "dark" | "light" | "system";
export type BlablaHostThemeEffectiveMode = "dark" | "light";
export type BlablaHostSurfaceBackground = "host-material" | "page" | "theme";

export interface BlablaHostThemeState {
  accentColor: {
    color: string;
    foreground: string;
    id: string;
  };
  effective: BlablaHostThemeEffectiveMode;
  mode: BlablaHostThemeMode;
  tokens: {
    accent: string;
    accentForeground: string;
    assetAction: string;
    background: string;
    border: string;
    foreground: string;
    muted: string;
    mutedForeground: string;
    primary: string;
    primaryForeground: string;
    surface: string;
  };
}

export interface BlablaHostThemeChangeEvent {
  kind: "theme.changed";
  theme: BlablaHostThemeState;
}

export type BlablaHostEvent =
  | BlablaHostFileReferenceChangeEvent
  | BlablaHostSurfaceCommandEvent
  | BlablaHostSurfaceFileReferenceAddEvent
  | BlablaHostSurfaceFilesAddEvent
  | BlablaHostThemeChangeEvent
  | { kind: "library.reset" };

declare global {
  interface Window {
    blablaHost?: BlablaHostBridge;
  }
}

export function fileReferenceToCanvasSourceReference(
  reference: BlablaHostFileReference
): CanvasSourceReference {
  return {
    id: reference.id,
    missing: reference.missing,
    sourceFingerprint: reference.sourceFingerprint
  };
}

export function fileReferenceToCanvasContextReference(
  reference: BlablaHostFileReference
): CanvasAssetContextReference {
  return {
    ...fileReferenceToCanvasSourceReference(reference),
    remoteVideo: reference.remoteVideo
      ? {
          provider: reference.remoteVideo.provider,
          url: reference.remoteVideo.url
        }
      : null,
    sourceKind: reference.sourceKind
  };
}

export function mergeFileReferenceRecords(
  current: Record<string, BlablaHostFileReference>,
  references: readonly BlablaHostFileReference[]
): Record<string, BlablaHostFileReference> {
  if (references.length === 0) {
    return current;
  }

  const next = { ...current };
  for (const reference of references) {
    next[reference.id] = reference;
  }
  return next;
}

export function fileReferenceDragIdsFromDataTransfer(
  dataTransfer: DataTransfer | null
): string[] {
  if (!dataTransfer) {
    return [];
  }

  try {
    const raw = dataTransfer.getData(BLABLA_FILE_REFERENCE_DRAG_MIME);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function removeFileReferenceRecords(
  current: Record<string, BlablaHostFileReference>,
  ids: readonly string[]
): Record<string, BlablaHostFileReference> {
  if (ids.length === 0) {
    return current;
  }

  const next = { ...current };
  for (const id of ids) {
    delete next[id];
  }
  return next;
}
