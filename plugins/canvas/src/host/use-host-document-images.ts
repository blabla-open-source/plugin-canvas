import { useCallback, useEffect } from "react";
import { createPromotedCanvasAssetPatch } from "../canvas/canvas-asset-placement";
import { documentAttachmentToPromotedCanvasAsset } from "../canvas/canvas-document-attachment";
import type { PromotedCanvasAssetInput } from "../canvas/canvas-scene-promoted-assets";
import { nextCanvasSceneTopLevelZ } from "../canvas/canvas-scene-reorder";
import type { CanvasPoint, CanvasScene } from "../canvas/types";
import type { BlablaHostBridge } from "./host-api";

interface MutableValue<T> {
  current: T;
}

interface DocumentImageInput {
  bytes: Uint8Array;
  mime: string;
  name: string;
}

interface UseCanvasDocumentImagesInput {
  beforeWriteAttachment?: () => void;
  commitSceneChange: (
    createPatch: (scene: CanvasScene) => CanvasScene,
  ) => Promise<void>;
  fallbackPoint: () => CanvasPoint;
  hostBridgeRef: MutableValue<BlablaHostBridge | null>;
  loaded: boolean;
  onError: (message: string) => void;
}

const MAX_CLIPBOARD_IMAGES = 16;
const MAX_CLIPBOARD_IMAGE_BYTES = 100 * 1024 * 1024;

export function useCanvasDocumentImages({
  beforeWriteAttachment,
  commitSceneChange,
  fallbackPoint,
  hostBridgeRef,
  loaded,
  onError,
}: UseCanvasDocumentImagesInput) {
  const addImages = useCallback(
    async (items: readonly DocumentImageInput[], point = fallbackPoint()) => {
      const hostBridge = hostBridgeRef.current;
      if (!(hostBridge && loaded && items.length > 0)) {
        return;
      }
      const promotedAssets: PromotedCanvasAssetInput[] = [];
      for (const item of items) {
        const size = await imageSizeFromBytes(item);
        beforeWriteAttachment?.();
        const attachment = await hostBridge.document.writeAttachment(item);
        promotedAssets.push(
          documentAttachmentToPromotedCanvasAsset(attachment, size),
        );
      }
      await commitSceneChange((scene) =>
        createPromotedCanvasAssetPatch({
          point,
          promotedAssets,
          startZ: nextCanvasSceneTopLevelZ(scene),
        }),
      );
    },
    [beforeWriteAttachment, commitSceneChange, fallbackPoint, loaded],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditablePasteTarget(event.target)) {
        return;
      }
      const files = Array.from(event.clipboardData?.files ?? []).filter(
        (file) => file.type.startsWith("image/"),
      );
      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      readBoundedClipboardImages(files)
        .then((items) => addImages(items))
        .catch((error) => onError(errorMessage(error)));
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addImages, onError]);

  return addImages;
}

async function readBoundedClipboardImages(
  files: readonly File[],
): Promise<DocumentImageInput[]> {
  if (
    files.length > MAX_CLIPBOARD_IMAGES ||
    files.reduce((total, file) => total + file.size, 0) >
      MAX_CLIPBOARD_IMAGE_BYTES
  ) {
    throw new Error("Paste up to 16 images totaling 100 MB.");
  }
  const items: DocumentImageInput[] = [];
  for (const file of files) {
    items.push({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mime: file.type,
      name: file.name || pastedImageName(file.type),
    });
  }
  return items;
}

async function imageSizeFromBytes(
  input: DocumentImageInput,
): Promise<{ height: number; width: number }> {
  const bytes = new Uint8Array(input.bytes);
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: input.mime }),
  );
  const size = { height: bitmap.height, width: bitmap.width };
  bitmap.close();
  return size;
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest("input, textarea, [contenteditable='true']"))
  );
}

function pastedImageName(mime: string): string {
  const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1] || "png";
  return `Pasted Image ${new Date().toISOString().replaceAll(":", "-")}.${extension}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
