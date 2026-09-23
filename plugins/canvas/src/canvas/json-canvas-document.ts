import z from "zod";
import {
  defaultCanvasFileReferenceShelfState,
  INITIAL_CANVAS_VIEWPORT,
  type CanvasDocument,
} from "./canvas-document";
import {
  isCanvasDocumentAttachmentFile,
  isCanvasSourceBackedPageAttachment,
} from "./canvas-document-attachment";
import { canvasSceneFromJsonCanvas } from "./json-canvas-scene";
import type { CanvasAsset, CanvasGroup, CanvasNode, CanvasViewport } from "./types";

export const EMPTY_JSON_CANVAS_TEXT = '{\n  "nodes": [],\n  "edges": []\n}\n';
const BLABLA_EXTENSION_FIELD = "x-blabla";

const jsonCanvasNodeSchema = z
  .object({
    height: z.number(),
    id: z.string().min(1),
    type: z.string().min(1),
    width: z.number(),
    x: z.number(),
    y: z.number(),
  })
  .passthrough();

const jsonCanvasDocumentSchema = z
  .object({
    edges: z.array(z.unknown()).default([]),
    nodes: z.array(jsonCanvasNodeSchema).default([]),
  })
  .passthrough();

export type JsonCanvasNode = z.infer<typeof jsonCanvasNodeSchema>;
export type JsonCanvasDocument = z.infer<typeof jsonCanvasDocumentSchema>;

export interface JsonCanvasDocumentContext {
  documentId: string;
  name: string;
  now?: number;
  sourcePath?: string;
}

export function parseJsonCanvasText(
  content: string,
  context: JsonCanvasDocumentContext
): CanvasDocument {
  const trimmed = content.trim();
  const raw = jsonCanvasDocumentSchema.parse(
    trimmed ? JSON.parse(trimmed) : JSON.parse(EMPTY_JSON_CANVAS_TEXT)
  );
  return canvasDocumentFromJsonCanvas(raw, context);
}

export function serializeCanvasDocumentToJsonCanvas(
  document: CanvasDocument
): string {
  const raw = cloneJsonCanvasDocument(document.jsonCanvas);
  const sceneNodeById = new Map(
    document.scene.nodes.map((node) => [node.id, node])
  );
  const nextNodes: JsonCanvasNode[] = [];
  const emittedSceneNodeIds = new Set<string>();

  for (const rawNode of raw.nodes) {
    const node = sceneNodeById.get(rawNode.id);
    const asset = node ? document.scene.assets[node.assetId] : undefined;
    if (!(node && asset)) {
      nextNodes.push(rawNode);
      continue;
    }

    nextNodes.push(jsonCanvasNodeFromCanvasNode(node, asset, rawNode));
    emittedSceneNodeIds.add(node.id);
  }

  for (const node of [...document.scene.nodes].sort(
    (left, right) => left.z - right.z
  )) {
    if (emittedSceneNodeIds.has(node.id)) {
      continue;
    }

    const asset = document.scene.assets[node.assetId];
    if (asset) {
      nextNodes.push(jsonCanvasNodeFromCanvasNode(node, asset));
    }
  }

  raw.nodes = nextNodes;
  writeDocumentExtension(raw, document);
  return `${JSON.stringify(raw, null, 2)}\n`;
}

function canvasDocumentFromJsonCanvas(
  raw: JsonCanvasDocument,
  context: JsonCanvasDocumentContext
): CanvasDocument {
  const now = context.now ?? Date.now();
  return {
    createdAt: now,
    fileReferenceShelf: defaultCanvasFileReferenceShelfState(),
    id: context.documentId,
    jsonCanvas: cloneJsonCanvasDocument(raw),
    name: titleWithoutCanvasExtension(context.name),
    scene: canvasSceneFromJsonCanvas(raw),
    schemaVersion: 1,
    updatedAt: now,
    viewport:
      canvasViewportFromExtension(
        recordField(raw, BLABLA_EXTENSION_FIELD)?.viewport
      ) ?? { ...INITIAL_CANVAS_VIEWPORT },
  };
}

function jsonCanvasNodeFromCanvasNode(
  node: CanvasNode,
  asset: CanvasAsset,
  existing?: JsonCanvasNode
): JsonCanvasNode {
  const next = existing
    ? ({ ...existing } as JsonCanvasNode)
    : jsonCanvasNodeForAsset(node, asset);
  next.x = Math.round(node.x);
  next.y = Math.round(node.y);
  next.width = Math.round(node.width);
  next.height = Math.round(node.height);

  writeNodeExtension(next, node, asset, existing === undefined);

  return next;
}

function jsonCanvasNodeForAsset(
  node: CanvasNode,
  asset: CanvasAsset
): JsonCanvasNode {
  const base = {
    height: Math.round(node.height),
    id: node.id,
    type: "file",
    width: Math.round(node.width),
    x: Math.round(node.x),
    y: Math.round(node.y),
  };

  if (typeof asset.acceptedTextSnapshot === "string") {
    return {
      ...base,
      text: asset.acceptedTextSnapshot,
      type: "text",
    };
  }

  if (asset.remoteVideo?.url) {
    return {
      ...base,
      type: "link",
      url: asset.remoteVideo.url,
    };
  }

  return {
    ...base,
    file: asset.jsonCanvasFile ?? asset.name,
  };
}

function cloneJsonCanvasDocument(
  document: JsonCanvasDocument | undefined
): JsonCanvasDocument {
  return jsonCanvasDocumentSchema.parse(
    JSON.parse(JSON.stringify(document ?? JSON.parse(EMPTY_JSON_CANVAS_TEXT)))
  );
}

function writeDocumentExtension(
  raw: JsonCanvasDocument,
  document: CanvasDocument
): void {
  const rawRecord = raw as Record<string, unknown>;
  const extension = {
    ...(recordField(raw, BLABLA_EXTENSION_FIELD) ?? {}),
  };

  if (
    extension.viewport !== undefined ||
    !sameCanvasViewport(document.viewport, INITIAL_CANVAS_VIEWPORT)
  ) {
    extension.viewport = {
      x: Math.round(document.viewport.x),
      y: Math.round(document.viewport.y),
      zoom: document.viewport.zoom,
    };
  } else {
    delete extension.viewport;
  }

  const groups = Object.values(document.scene.groups).sort(
    (left, right) => left.z - right.z
  );
  if (groups.length > 0) {
    extension.groups = groups.map(canvasGroupExtension);
  } else {
    delete extension.groups;
  }

  delete extension.thumbnail;

  if (Object.keys(extension).length === 0) {
    delete rawRecord[BLABLA_EXTENSION_FIELD];
  } else {
    rawRecord[BLABLA_EXTENSION_FIELD] = extension;
  }
}

function writeNodeExtension(
  rawNode: JsonCanvasNode,
  node: CanvasNode,
  asset: CanvasAsset,
  createdByBlabla: boolean
): void {
  const rawNodeRecord = rawNode as Record<string, unknown>;
  const extension = {
    ...(recordField(rawNode, BLABLA_EXTENSION_FIELD) ?? {}),
  };

  if (node.rotation) {
    extension.rotation = Math.round(node.rotation);
  } else {
    delete extension.rotation;
  }

  if (shouldWriteNodeMetadata(extension, node, createdByBlabla)) {
    extension.node = canvasNodeExtension(node);
  } else {
    delete extension.node;
  }

  if (shouldWriteAssetMetadata(extension, asset, createdByBlabla)) {
    extension.asset = canvasAssetExtension(asset);
  } else {
    delete extension.asset;
  }

  if (Object.keys(extension).length === 0) {
    delete rawNodeRecord[BLABLA_EXTENSION_FIELD];
  } else {
    rawNodeRecord[BLABLA_EXTENSION_FIELD] = extension;
  }
}

function shouldWriteNodeMetadata(
  extension: Record<string, unknown>,
  node: CanvasNode,
  createdByBlabla: boolean
): boolean {
  return (
    createdByBlabla ||
    extension.node !== undefined ||
    node.groupId !== undefined
  );
}

function shouldWriteAssetMetadata(
  extension: Record<string, unknown>,
  asset: CanvasAsset,
  createdByBlabla: boolean
): boolean {
  return (
    createdByBlabla ||
    extension.asset !== undefined ||
    asset.sourceIssue !== undefined ||
    asset.sourceIssueIgnoredFingerprint !== undefined ||
    asset.sourceMissingIgnored !== undefined ||
    asset.sourcePageNumber !== undefined
  );
}

function canvasNodeExtension(node: CanvasNode): Record<string, unknown> {
  return omitUndefined({
    groupId: node.groupId,
    z: node.z,
  });
}

function canvasAssetExtension(asset: CanvasAsset): Record<string, unknown> {
  const documentAttachment =
    asset.jsonCanvasFile !== undefined &&
    isCanvasDocumentAttachmentFile(asset.jsonCanvasFile);
  const sourceBackedPageAttachment =
    isCanvasSourceBackedPageAttachment(asset);
  const attachmentOwnsSource = documentAttachment && !sourceBackedPageAttachment;
  return omitUndefined({
    acceptedTextSnapshot: asset.acceptedTextSnapshot,
    byteSize: asset.byteSize,
    height: asset.height,
    id: asset.id,
    kind: asset.kind,
    mediaUrl: documentAttachment ? undefined : asset.mediaUrl,
    mime: asset.mime,
    name: asset.name,
    pageCount: asset.pageCount,
    remoteVideo: documentAttachment ? undefined : asset.remoteVideo,
    snapshotUrl: documentAttachment ? undefined : asset.snapshotUrl,
    sourceAssetId: attachmentOwnsSource ? undefined : asset.sourceAssetId,
    sourceFingerprint: attachmentOwnsSource
      ? undefined
      : asset.sourceFingerprint,
    sourceIssue: documentAttachment ? undefined : asset.sourceIssue,
    sourceIssueIgnoredFingerprint: documentAttachment
      ? undefined
      : asset.sourceIssueIgnoredFingerprint,
    sourceMissingIgnored: documentAttachment
      ? undefined
      : asset.sourceMissingIgnored,
    sourcePageNumber: attachmentOwnsSource ? undefined : asset.sourcePageNumber,
    textObstacle: asset.textObstacle,
    url: documentAttachment ? undefined : asset.url,
    width: asset.width,
  });
}

function canvasGroupExtension(group: CanvasGroup): Record<string, unknown> {
  return omitUndefined({
    height: group.height,
    id: group.id,
    rotation: group.rotation,
    sourceAssetId: group.sourceAssetId,
    sourceNodeId: group.sourceNodeId,
    totalItems: group.totalItems,
    type: group.type,
    width: group.width,
    x: group.x,
    y: group.y,
    z: group.z,
  });
}

function canvasViewportFromExtension(
  value: unknown
): CanvasViewport | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { x, y, zoom } = value;
  return typeof x === "number" &&
    typeof y === "number" &&
    typeof zoom === "number" &&
    Number.isFinite(zoom) &&
    zoom > 0
    ? { x, y, zoom }
    : undefined;
}

function recordField(
  node: Record<string, unknown>,
  field: string
): Record<string, unknown> | undefined {
  const value = node[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omitUndefined(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function sameCanvasViewport(
  left: CanvasViewport,
  right: CanvasViewport
): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function titleWithoutCanvasExtension(name: string): string {
  return name.toLowerCase().endsWith(".canvas") ? name.slice(0, -7) : name;
}
