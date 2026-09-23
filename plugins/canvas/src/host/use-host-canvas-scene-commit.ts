import { type Dispatch, type SetStateAction, useCallback } from "react";
import {
  type CanvasDocumentSaveOwner,
  commitCanvasSessionScenePatch,
} from "../canvas/canvas-document-save-owner";
import type { CanvasDocument } from "../canvas/canvas-document-types";
import type { CanvasSession } from "../canvas/canvas-session";
import type { CanvasScene } from "../canvas/types";

interface MutableValue<T> {
  current: T;
}

export function useHostCanvasSceneCommit(input: {
  onError: (message: string) => void;
  owner: CanvasDocumentSaveOwner;
  saveDocument: (document: CanvasDocument) => Promise<unknown>;
  sessionRef: MutableValue<CanvasSession | null>;
  setSession: Dispatch<SetStateAction<CanvasSession | null>>;
}): (createPatch: (scene: CanvasScene) => CanvasScene) => Promise<void> {
  const { onError, owner, saveDocument, sessionRef, setSession } = input;
  return useCallback(
    async (createPatch) => {
      await owner.run(async () => {
        await commitCanvasSessionScenePatch({
          createPatch,
          current: () => sessionRef.current,
          onRebaseSaveError: (error) => onError(errorMessage(error)),
          publish: (next) => {
            sessionRef.current = next;
            setSession(next);
          },
          save: saveDocument,
        });
      });
    },
    [onError, owner, saveDocument, sessionRef, setSession],
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
