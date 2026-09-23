export interface BlablaHostBridgeDocumentRecord {
  documentId: string;
  payload: unknown;
  surfaceId: string;
  updatedAt: number | null;
  version: number;
}

export interface BlablaHostBridgeDocumentThumbnail {
  fileName: string;
  height: number;
  mime: "image/webp";
  updatedAt: number;
  width: number;
}

export interface BlablaHostDocumentAttachment {
  byteSize: number;
  file: string;
  fingerprint: string;
  mime: string;
  name: string;
  url: string;
}

export interface BlablaHostSurfaceFileReferenceAddEvent {
  clientX?: number;
  clientY?: number;
  kind: "surface.fileReferences.add";
  referenceIds: string[];
}

export interface BlablaHostSurfaceFilesAddEvent {
  clientX?: number;
  clientY?: number;
  items: Array<{
    bytes: Uint8Array;
    mime: string;
    name: string;
  }>;
  kind: "surface.files.add";
}
