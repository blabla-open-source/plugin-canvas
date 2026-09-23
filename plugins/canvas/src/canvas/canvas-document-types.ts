import type {
  CanvasFileReferenceShelfState,
  CanvasScene,
  CanvasViewport
} from "./types";
import type { JsonCanvasDocument } from "./json-canvas-document";

export interface CanvasDocument {
  createdAt: number;
  fileReferenceShelf: CanvasFileReferenceShelfState;
  id: string;
  jsonCanvas?: JsonCanvasDocument;
  name: string;
  scene: CanvasScene;
  schemaVersion: 1;
  thumbnail?: CanvasDocumentThumbnail;
  trashedAt?: number;
  updatedAt: number;
  viewport: CanvasViewport;
}

export interface CanvasDocumentThumbnail {
  fileName?: string;
  height: number;
  mime: "image/webp";
  updatedAt: number;
  width: number;
}

export interface CanvasDocumentSummary {
  assetCount: number;
  createdAt: number;
  id: string;
  name: string;
  nodeCount: number;
  thumbnail?: CanvasDocumentThumbnail;
  trashedAt?: number;
  updatedAt: number;
}
