import type {
  CanvasDocument,
  CanvasDocumentThumbnail
} from "./canvas-document-types";
import {
  defaultCanvasFileReferenceShelfState,
  normalizeCanvasFileReferenceShelfState
} from "./canvas-file-reference-shelf";
import {
  beginCanvasSceneHistoryCapture,
  canRedoCanvasSceneChange,
  canUndoCanvasSceneChange,
  captureCanvasSceneChange,
  commitCanvasSceneHistoryCapture,
  emptyCanvasSceneHistory,
  isSameCanvasScene,
  redoCanvasSceneChange,
  type CanvasSceneHistory,
  undoCanvasSceneChange
} from "./canvas-history";
import type {
  CanvasFileReferenceShelfState,
  CanvasScene,
  CanvasViewport
} from "./types";
import type { JsonCanvasDocument } from "./json-canvas-document";

export type CanvasSceneCaptureMode = "ignore" | "record";

export interface CanvasSceneChangeOptions {
  capture?: CanvasSceneCaptureMode;
  thumbnail?: "ignore" | "record";
}

export type CanvasSceneUpdater = (scene: CanvasScene) => CanvasScene;
export type CanvasSceneUpdateOptions = CanvasSceneChangeOptions;
export type CanvasSceneChangeHandler = (
  updater: CanvasSceneUpdater,
  options?: CanvasSceneUpdateOptions
) => void;
export type CanvasSessionByTabId = Record<string, CanvasSession>;

export interface CanvasSession {
  createdAt: number;
  fileReferenceShelf: CanvasFileReferenceShelfState;
  history: CanvasSceneHistory;
  id: string;
  jsonCanvas?: JsonCanvasDocument;
  name: string;
  scene: CanvasScene;
  sourceAssetIds: string[];
  thumbnail?: CanvasDocumentThumbnail;
  thumbnailRevision: number;
  trashedAt?: number;
  updatedAt: number;
  viewport: CanvasViewport;
}

export type CanvasSessionAction =
  | { captureId: string; tabId: string; type: "BEGIN_CANVAS_HISTORY_CAPTURE" }
  | { captureId: string; tabId: string; type: "COMMIT_CANVAS_HISTORY_CAPTURE" }
  | { tabId: string; type: "ENSURE_CANVAS_SESSION" }
  | { tabId: string; type: "REMOVE_CANVAS_SESSION" }
  | { liveTabIds: ReadonlySet<string>; type: "PRUNE_CANVAS_SESSIONS" }
  | { tabId: string; type: "REDO_CANVAS_SCENE" }
  | { tabId: string; type: "UNDO_CANVAS_SCENE" }
  | {
      options?: CanvasSceneUpdateOptions;
      tabId: string;
      type: "UPDATE_CANVAS_SCENE";
      updater: CanvasSceneUpdater;
    }
  | {
      tabId: string;
      type: "SET_CANVAS_VIEWPORT";
      viewport: CanvasViewport;
    };

export function createCanvasSession(tabId: string): CanvasSession {
  const now = Date.now();
  const scene: CanvasScene = {
    assets: {},
    groups: {},
    nodes: []
  };

  return {
    createdAt: now,
    fileReferenceShelf: defaultCanvasFileReferenceShelfState(),
    history: emptyCanvasSceneHistory(),
    id: tabId,
    name: "Canvas",
    scene,
    sourceAssetIds: [],
    thumbnailRevision: 0,
    updatedAt: now,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    }
  };
}

export function createCanvasSessionFromDocument(
  document: CanvasDocument
): CanvasSession {
  return {
    createdAt: document.createdAt,
    fileReferenceShelf: normalizeCanvasFileReferenceShelfState(
      document.fileReferenceShelf
    ),
    history: emptyCanvasSceneHistory(),
    id: document.id,
    jsonCanvas: document.jsonCanvas,
    name: document.name,
    scene: document.scene,
    sourceAssetIds: collectCanvasSceneSourceAssetIds(document.scene),
    thumbnail: document.thumbnail,
    thumbnailRevision: 0,
    trashedAt: document.trashedAt,
    updatedAt: document.updatedAt,
    viewport: document.viewport
  };
}

export function collectCanvasSceneSourceAssetIds(scene: CanvasScene): string[] {
  const ids = new Set<string>();

  for (const asset of Object.values(scene.assets)) {
    if (asset.sourceAssetId) {
      ids.add(asset.sourceAssetId);
    }
  }

  return [...ids].sort();
}

export function createCanvasSessions(
  tabIds: Iterable<string>
): CanvasSessionByTabId {
  const sessions: CanvasSessionByTabId = {};

  for (const tabId of tabIds) {
    sessions[tabId] = createCanvasSession(tabId);
  }

  return sessions;
}

export function canvasSessionReducer(
  state: CanvasSessionByTabId,
  action: CanvasSessionAction
): CanvasSessionByTabId {
  switch (action.type) {
    case "ENSURE_CANVAS_SESSION":
      return state[action.tabId]
        ? state
        : replaceCanvasSession(state, action.tabId, createCanvasSession(action.tabId));
    case "REMOVE_CANVAS_SESSION": {
      if (!state[action.tabId]) {
        return state;
      }

      const { [action.tabId]: _removed, ...next } = state;
      return next;
    }
    case "PRUNE_CANVAS_SESSIONS": {
      let changed = false;
      const next: CanvasSessionByTabId = {};

      for (const [tabId, session] of Object.entries(state)) {
        if (!action.liveTabIds.has(tabId)) {
          changed = true;
          continue;
        }

        next[tabId] = session;
      }

      return changed ? next : state;
    }
    case "BEGIN_CANVAS_HISTORY_CAPTURE": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(
            state,
            action.tabId,
            beginCanvasSessionHistoryCapture(session, action.captureId)
          )
        : state;
    }
    case "COMMIT_CANVAS_HISTORY_CAPTURE": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(
            state,
            action.tabId,
            commitCanvasSessionHistoryCapture(session, action.captureId)
          )
        : state;
    }
    case "UPDATE_CANVAS_SCENE": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(
            state,
            action.tabId,
            updateCanvasSessionScene(session, action.updater, action.options)
          )
        : state;
    }
    case "UNDO_CANVAS_SCENE": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(state, action.tabId, undoCanvasSession(session))
        : state;
    }
    case "REDO_CANVAS_SCENE": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(state, action.tabId, redoCanvasSession(session))
        : state;
    }
    case "SET_CANVAS_VIEWPORT": {
      const session = state[action.tabId];
      return session
        ? replaceCanvasSession(
            state,
            action.tabId,
            updateCanvasSessionViewport(session, action.viewport)
          )
        : state;
    }
    default:
      return state;
  }
}

function replaceCanvasSession(
  state: CanvasSessionByTabId,
  tabId: string,
  session: CanvasSession
): CanvasSessionByTabId {
  return state[tabId] === session
    ? state
    : {
        ...state,
        [tabId]: session
      };
}

export function canvasSessionToDocument(session: CanvasSession): CanvasDocument {
  return {
    createdAt: session.createdAt,
    fileReferenceShelf: session.fileReferenceShelf,
    id: session.id,
    jsonCanvas: session.jsonCanvas,
    name: session.name,
    scene: session.scene,
    schemaVersion: 1,
    thumbnail: session.thumbnail,
    trashedAt: session.trashedAt,
    updatedAt: session.updatedAt,
    viewport: session.viewport
  };
}

export function updateCanvasSessionScene(
  session: CanvasSession,
  updater: CanvasSceneUpdater,
  options: CanvasSceneChangeOptions = {}
): CanvasSession {
  const nextScene = updater(session.scene);
  if (nextScene === session.scene || isSameCanvasScene(session.scene, nextScene)) {
    return session;
  }

  const history =
    options.capture === "ignore"
      ? session.history
      : captureCanvasSceneChange(session.history, session.scene, nextScene);

  return {
    ...session,
    history,
    scene: nextScene,
    sourceAssetIds: nextCanvasSceneSourceAssetIds(session, nextScene),
    thumbnailRevision:
      options.thumbnail === "ignore"
        ? session.thumbnailRevision
        : session.thumbnailRevision + 1,
    updatedAt: Date.now()
  };
}

export function beginCanvasSessionHistoryCapture(
  session: CanvasSession,
  captureId: string
): CanvasSession {
  const history = beginCanvasSceneHistoryCapture(
    session.history,
    captureId,
    session.scene
  );

  return history === session.history ? session : { ...session, history };
}

export function commitCanvasSessionHistoryCapture(
  session: CanvasSession,
  captureId: string
): CanvasSession {
  if (session.history.capture?.id !== captureId) {
    return session;
  }

  const shouldUpdateThumbnail = !isSameCanvasScene(
    session.history.capture.before,
    session.scene
  );
  const history = commitCanvasSceneHistoryCapture(session.history, session.scene);
  if (history === session.history) {
    return session;
  }

  return {
    ...session,
    history,
    thumbnailRevision: shouldUpdateThumbnail
      ? session.thumbnailRevision + 1
      : session.thumbnailRevision,
    updatedAt: shouldUpdateThumbnail ? Date.now() : session.updatedAt
  };
}

export function updateCanvasSessionViewport(
  session: CanvasSession,
  viewport: CanvasViewport
): CanvasSession {
  if (
    session.viewport.x === viewport.x &&
    session.viewport.y === viewport.y &&
    session.viewport.zoom === viewport.zoom
  ) {
    return session;
  }

  return {
    ...session,
    updatedAt: Date.now(),
    viewport
  };
}

export function updateCanvasSessionThumbnail(
  session: CanvasSession,
  thumbnail: CanvasDocumentThumbnail | undefined
): CanvasSession {
  if (sameCanvasDocumentThumbnail(session.thumbnail, thumbnail)) {
    return session;
  }

  return {
    ...session,
    thumbnail,
    updatedAt: Date.now()
  };
}

export function undoCanvasSession(session: CanvasSession): CanvasSession {
  const result = undoCanvasSceneChange(session.scene, session.history);

  if (result.scene === session.scene) {
    return session;
  }

  return {
    ...session,
    history: result.history,
    scene: result.scene,
    sourceAssetIds: nextCanvasSceneSourceAssetIds(session, result.scene),
    thumbnailRevision: session.thumbnailRevision + 1,
    updatedAt: Date.now()
  };
}

export function redoCanvasSession(session: CanvasSession): CanvasSession {
  const result = redoCanvasSceneChange(session.scene, session.history);

  if (result.scene === session.scene) {
    return session;
  }

  return {
    ...session,
    history: result.history,
    scene: result.scene,
    sourceAssetIds: nextCanvasSceneSourceAssetIds(session, result.scene),
    thumbnailRevision: session.thumbnailRevision + 1,
    updatedAt: Date.now()
  };
}

function nextCanvasSceneSourceAssetIds(
  session: CanvasSession,
  scene: CanvasScene
): string[] {
  const sourceAssetIds = collectCanvasSceneSourceAssetIds(scene);
  return sameStringArray(sourceAssetIds, session.sourceAssetIds)
    ? session.sourceAssetIds
    : sourceAssetIds;
}

function sameStringArray(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function canUndoCanvasSession(session: CanvasSession): boolean {
  return canUndoCanvasSceneChange(session.history);
}

export function canRedoCanvasSession(session: CanvasSession): boolean {
  return canRedoCanvasSceneChange(session.history);
}

function sameCanvasDocumentThumbnail(
  left: CanvasDocumentThumbnail | undefined,
  right: CanvasDocumentThumbnail | undefined
): boolean {
  return (
    left?.fileName === right?.fileName &&
    left?.height === right?.height &&
    left?.mime === right?.mime &&
    left?.updatedAt === right?.updatedAt &&
    left?.width === right?.width
  );
}
