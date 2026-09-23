import z from "zod";
import type {
  CanvasDocument as CanvasDocumentShape,
  CanvasDocumentSummary as CanvasDocumentSummaryShape,
  CanvasDocumentThumbnail as CanvasDocumentThumbnailShape
} from "./canvas-document-types";
import type { JsonCanvasDocument } from "./json-canvas-document";
import {
  DEFAULT_FILE_REFERENCE_SHELF,
  defaultCanvasFileReferenceShelfState,
  normalizeCanvasFileReferenceShelfState
} from "./canvas-file-reference-shelf";
import {
  CANVAS_ASSET_KINDS,
  type CanvasFileReferenceShelfState as CanvasFileReferenceShelfStateShape,
  type CanvasScene,
  type CanvasViewport
} from "./types";

export {
  DEFAULT_FILE_REFERENCE_SHELF,
  defaultCanvasFileReferenceShelfState,
  normalizeCanvasFileReferenceShelfState
} from "./canvas-file-reference-shelf";

export type CanvasDocument = CanvasDocumentShape;
export type CanvasDocumentSummary = CanvasDocumentSummaryShape;
export type CanvasDocumentThumbnail = CanvasDocumentThumbnailShape;
export type CanvasFileReferenceShelfState = CanvasFileReferenceShelfStateShape;

export const CANVAS_DOCUMENT_SCHEMA_VERSION = 1;

export const INITIAL_CANVAS_VIEWPORT: CanvasViewport = {
  x: 0,
  y: 0,
  zoom: 1
};

export function emptyCanvasScene(): CanvasScene {
  return {
    assets: {},
    groups: {},
    nodes: []
  };
}

export const canvasRemoteVideoSchema = z.object({
  authorName: z.string().optional(),
  authorUrl: z.string().optional(),
  canonicalUrl: z.string().optional(),
  duration: z.number().optional(),
  embedUrl: z.string(),
  height: z.number().optional(),
  metadataCapturedAt: z.string().optional(),
  originalUrl: z.string().optional(),
  provider: z.enum(["bilibili", "generic", "vimeo", "youtube"]),
  providerTags: z.array(z.string()).optional(),
  publishedAt: z.string().optional(),
  statistics: z
    .object({
      coinCount: z.number().optional(),
      commentCount: z.number().optional(),
      favoriteCount: z.number().optional(),
      likeCount: z.number().optional(),
      shareCount: z.number().optional(),
      viewCount: z.number().optional()
    })
    .optional(),
  thumbnailHeight: z.number().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailWidth: z.number().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  videoId: z.string().optional(),
  width: z.number().optional()
});

export const canvasTextObstacleSchema = z.object({
  height: z.number(),
  width: z.number(),
  x: z.number(),
  y: z.number()
});

export const canvasAssetSourceIssueSchema = z.object({
  code: z.enum(["missing-source", "stale-source", "unsupported-source"]),
  message: z.string(),
  observedAt: z.string()
});

const timestampSchema = z.preprocess(
  (value) => (typeof value === "string" ? Date.parse(value) : value),
  z.number().int().nonnegative()
);

const optionalTimestampSchema = z.preprocess(
  (value) =>
    value === null
      ? undefined
      : typeof value === "string"
        ? Date.parse(value)
        : value,
  z.number().int().nonnegative().optional()
);

const canvasAssetStorageSchema = z.object({
  acceptedTextSnapshot: z.string().optional(),
  aspectRatio: z.number().optional(),
  byteSize: z.number().optional(),
  createdAt: z.string().optional(),
  height: z.number(),
  id: z.string(),
  jsonCanvasBackground: z.string().optional(),
  jsonCanvasBackgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
  jsonCanvasColor: z.string().optional(),
  jsonCanvasFile: z.string().optional(),
  jsonCanvasLabel: z.string().optional(),
  jsonCanvasNodeType: z.string().optional(),
  jsonCanvasSubpath: z.string().optional(),
  jsonCanvasUrl: z.string().optional(),
  kind: z.enum(CANVAS_ASSET_KINDS),
  mediaUrl: z.string().optional(),
  mime: z.string(),
  name: z.string(),
  pageCount: z.number().int().positive().optional(),
  remoteVideo: canvasRemoteVideoSchema.optional(),
  snapshotUrl: z.string().optional(),
  sourceAssetId: z.string().optional(),
  sourceFingerprint: z.string().optional(),
  sourceIssue: canvasAssetSourceIssueSchema.optional(),
  sourceIssueIgnoredFingerprint: z.string().optional(),
  sourceMissingIgnored: z.boolean().optional(),
  sourcePageNumber: z.number().int().positive().optional(),
  textContent: z.string().optional(),
  textObstacle: canvasTextObstacleSchema.optional(),
  thumbnailUrl: z.string().optional(),
  updatedAt: z.string().optional(),
  url: z.string().optional(),
  width: z.number()
});

export const canvasAssetSchema = canvasAssetStorageSchema.transform(
  ({ acceptedTextSnapshot, textContent, ...asset }) => {
    const snapshot = acceptedTextSnapshot ?? textContent;
    return typeof snapshot === "string"
      ? { ...asset, acceptedTextSnapshot: snapshot }
      : asset;
  }
);

export const canvasGroupSchema = z.object({
  height: z.number(),
  id: z.string(),
  rotation: z.number(),
  sourceAssetId: z.string(),
  sourceNodeId: z.string().optional(),
  totalItems: z.number().int().positive().optional(),
  type: z.enum(["pdf-pages", "presentation-slides"]),
  width: z.number(),
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const canvasNodeSchema = z.object({
  assetId: z.string(),
  groupId: z.string().optional(),
  height: z.number(),
  id: z.string(),
  rotation: z.number(),
  width: z.number(),
  x: z.number(),
  y: z.number(),
  z: z.number()
});

export const canvasEdgeSchema = z.object({
  color: z.string().optional(),
  fromEnd: z.enum(["none", "arrow"]).default("none"),
  fromNode: z.string(),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  id: z.string(),
  label: z.string().optional(),
  toEnd: z.enum(["none", "arrow"]).default("arrow"),
  toNode: z.string(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional()
});

export const canvasSceneSchema = z.object({
  assets: z.record(z.string(), canvasAssetSchema),
  edges: z.array(canvasEdgeSchema).optional(),
  groups: z.record(z.string(), canvasGroupSchema).default({}),
  nodes: z.array(canvasNodeSchema)
});

export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number()
});

export const canvasFileReferenceShelfStateSchema = z
  .preprocess(
    (value) => value ?? DEFAULT_FILE_REFERENCE_SHELF,
    z
      .object({
        collapsed: z.boolean().optional(),
        selectedFileIds: z.array(z.string()).optional(),
        width: z.number().optional()
      })
      .passthrough()
  )
  .transform((state): CanvasFileReferenceShelfStateShape =>
    normalizeCanvasFileReferenceShelfState(state)
  );

export const canvasFileReferenceShelfSchema =
  canvasFileReferenceShelfStateSchema;

export const canvasDocumentThumbnailSchema = z.object({
  fileName: z.string().optional(),
  height: z.number().int().positive(),
  mime: z.literal("image/webp"),
  updatedAt: z.number().int().nonnegative(),
  width: z.number().int().positive()
});

const canvasDocumentThumbnailStorageSchema = z
  .union([canvasDocumentThumbnailSchema, z.string(), z.null()])
  .optional()
  .transform((thumbnail): CanvasDocumentThumbnail | undefined =>
    thumbnail && typeof thumbnail === "object" ? thumbnail : undefined
  );

export const canvasDocumentSchema = z.object({
  createdAt: timestampSchema,
  fileReferenceShelf: canvasFileReferenceShelfStateSchema.default(
    DEFAULT_FILE_REFERENCE_SHELF
  ),
  id: z.string(),
  jsonCanvas: z.custom<JsonCanvasDocument>().optional(),
  name: z.string(),
  scene: canvasSceneSchema,
  schemaVersion: z.literal(CANVAS_DOCUMENT_SCHEMA_VERSION),
  thumbnail: canvasDocumentThumbnailStorageSchema,
  trashedAt: optionalTimestampSchema,
  updatedAt: timestampSchema,
  viewport: canvasViewportSchema
});

export const canvasDocumentSummarySchema = z.object({
  assetCount: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  id: z.string(),
  name: z.string(),
  nodeCount: z.number().int().nonnegative(),
  thumbnail: canvasDocumentThumbnailSchema.optional(),
  trashedAt: optionalTimestampSchema,
  updatedAt: timestampSchema
});

interface CreateEmptyCanvasDocumentInput {
  id: string;
  name: string;
  now?: number;
}

export function createEmptyCanvasDocument(
  input: CreateEmptyCanvasDocumentInput
): CanvasDocumentShape;
export function createEmptyCanvasDocument(
  id?: string,
  name?: string
): CanvasDocumentShape;
export function createEmptyCanvasDocument(
  inputOrId: CreateEmptyCanvasDocumentInput | string = "canvas",
  name = "Canvas"
): CanvasDocumentShape {
  const id = typeof inputOrId === "string" ? inputOrId : inputOrId.id;
  const documentName =
    typeof inputOrId === "string" ? name : inputOrId.name;
  const now =
    typeof inputOrId === "string" ? Date.now() : (inputOrId.now ?? Date.now());

  return {
    createdAt: now,
    fileReferenceShelf: defaultCanvasFileReferenceShelfState(),
    id,
    name: documentName,
    scene: emptyCanvasScene(),
    schemaVersion: CANVAS_DOCUMENT_SCHEMA_VERSION,
    updatedAt: now,
    viewport: { ...INITIAL_CANVAS_VIEWPORT }
  };
}

export function parseCanvasDocument(input: unknown): CanvasDocument {
  return canvasDocumentSchema.parse(input);
}

export function summarizeCanvasDocument(
  document: CanvasDocumentShape
): CanvasDocumentSummary {
  return {
    assetCount: Object.keys(document.scene.assets).length,
    createdAt: document.createdAt,
    id: document.id,
    name: document.name,
    nodeCount: document.scene.nodes.length,
    thumbnail: document.thumbnail,
    trashedAt: document.trashedAt,
    updatedAt: document.updatedAt
  };
}
