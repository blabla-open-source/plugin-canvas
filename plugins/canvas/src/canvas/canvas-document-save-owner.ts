import type { CanvasDocument } from "./canvas-document-types";
import {
  canvasSessionToDocument,
  type CanvasSession,
  updateCanvasSessionScene,
} from "./canvas-session";
import { mergeScene } from "./canvas-scene-promoted-assets";
import type { CanvasScene } from "./types";

export class CanvasDocumentSaveOwner {
  private tail: Promise<void> = Promise.resolve();

  run<T>(save: () => Promise<T>): Promise<T> {
    const result = this.tail.then(save);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  drain(): Promise<void> {
    return this.tail;
  }
}

export function queueLatestCanvasDocumentSave(input: {
  current: () => CanvasDocument | null;
  currentRevision: () => number;
  owner: CanvasDocumentSaveOwner;
  saveIfChanged: (document: CanvasDocument) => Promise<number | null>;
}): Promise<number> {
  return input.owner.run(async () => {
    const current = input.current();
    if (!current) {
      return input.currentRevision();
    }
    return (await input.saveIfChanged(current)) ?? input.currentRevision();
  });
}

export async function commitCanvasSessionScenePatch(input: {
  createPatch: (scene: CanvasScene) => CanvasScene;
  current: () => CanvasSession | null;
  onRebaseSaveError: (error: unknown) => void;
  publish: (session: CanvasSession) => void;
  save: (document: CanvasDocument) => Promise<unknown>;
}): Promise<void> {
  const current = input.current();
  if (!current) {
    throw new Error("Canvas document is unavailable.");
  }
  const patch = input.createPatch(current.scene);
  const candidate = applyScenePatch(current, patch);
  await input.save(canvasSessionToDocument(candidate));

  const latest = input.current() ?? current;
  const published =
    latest === current ? candidate : applyScenePatch(latest, patch);
  input.publish(published);
  if (latest !== current) {
    try {
      await input.save(canvasSessionToDocument(published));
    } catch (error) {
      input.onRebaseSaveError(error);
    }
  }
}

function applyScenePatch(
  session: CanvasSession,
  patch: CanvasScene,
): CanvasSession {
  return updateCanvasSessionScene(session, (scene) => mergeScene(scene, patch));
}
