import z from "zod";
import type { JsonCanvasDocument, JsonCanvasNode } from "./json-canvas-document";
import type {
  CanvasAsset,
  CanvasEdge,
  CanvasEdgeEnd,
  CanvasEdgeSide,
  CanvasGroup,
  CanvasNode,
  CanvasScene,
} from "./types";

const BLABLA_EXTENSION_FIELD = "x-blabla";

const jsonCanvasEdgeSideSchema = z.enum(["top", "right", "bottom", "left"]);
const jsonCanvasEdgeEndSchema = z.enum(["none", "arrow"]);
const jsonCanvasEdgeSchema = z
  .object({
    color: z.string().optional(),
    fromEnd: jsonCanvasEdgeEndSchema.default("none"),
    fromNode: z.string().min(1),
    fromSide: jsonCanvasEdgeSideSchema.optional(),
    id: z.string().min(1),
    label: z.string().optional(),
    toEnd: jsonCanvasEdgeEndSchema.default("arrow"),
    toNode: z.string().min(1),
    toSide: jsonCanvasEdgeSideSchema.optional(),
  })
  .passthrough();

export function canvasSceneFromJsonCanvas(raw: JsonCanvasDocument): CanvasScene {
  const assets: Record<string, CanvasAsset> = {};
  const nodes: CanvasNode[] = [];

  raw.nodes.forEach((rawNode, index) => {
    const asset = canvasAssetFromJsonCanvasNode(rawNode);
    const node = canvasNodeFromJsonCanvasNode(rawNode, asset.id, index);
    assets[asset.id] = asset;
    nodes.push(node);
  });

  return {
    assets,
    edges: canvasEdgesFromJsonCanvas(raw),
    groups: canvasGroupsFromJsonCanvas(raw),
    nodes,
  };
}

function canvasAssetFromJsonCanvasNode(node: JsonCanvasNode): CanvasAsset {
  const assetExtension = recordField(
    recordField(node, BLABLA_EXTENSION_FIELD) ?? {},
    "asset"
  );
  const base = {
    height: node.height,
    id: stringField(assetExtension ?? {}, "id") ?? assetIdForJsonNode(node.id),
    jsonCanvasColor: stringField(node, "color"),
    jsonCanvasNodeType: node.type,
    width: node.width,
  };

  if (node.type === "text") {
    const text = stringField(node, "text") ?? "";
    return applyCanvasAssetExtension({
      ...base,
      acceptedTextSnapshot: text,
      byteSize: new TextEncoder().encode(text).byteLength,
      kind: "file",
      mime: "text/markdown",
      name: titleFromText(text) ?? "Text",
    }, assetExtension);
  }

  if (node.type === "link") {
    const url = stringField(node, "url") ?? "";
    return applyCanvasAssetExtension({
      ...base,
      jsonCanvasUrl: url,
      kind: "file",
      mime: "text/uri-list",
      name: url || "Link",
    }, assetExtension);
  }

  if (node.type === "file") {
    const file = stringField(node, "file") ?? "";
    return applyCanvasAssetExtension({
      ...base,
      jsonCanvasFile: file,
      jsonCanvasSubpath: stringField(node, "subpath"),
      kind: assetKindFromFile(file),
      mime: mimeFromFile(file),
      name: fileNameFromPath(file) || "File",
    }, assetExtension);
  }

  if (node.type === "group") {
    const label = stringField(node, "label") ?? "";
    const background = stringField(node, "background");
    return applyCanvasAssetExtension({
      ...base,
      jsonCanvasBackground: background,
      jsonCanvasBackgroundStyle: jsonCanvasBackgroundStyle(node),
      jsonCanvasFile: background,
      jsonCanvasLabel: label,
      kind: "file",
      mime: "application/vnd.canvas.group",
      name: label || "Group",
    }, assetExtension);
  }

  return applyCanvasAssetExtension({
    ...base,
    kind: "file",
    mime: "application/json",
    name: node.type,
  }, assetExtension);
}

function canvasEdgesFromJsonCanvas(raw: JsonCanvasDocument): CanvasEdge[] {
  return raw.edges.flatMap((edge): CanvasEdge[] => {
    const parsed = jsonCanvasEdgeSchema.safeParse(edge);
    if (!parsed.success) {
      return [];
    }

    return [
      {
        color: parsed.data.color,
        fromEnd: parsed.data.fromEnd as CanvasEdgeEnd,
        fromNode: parsed.data.fromNode,
        fromSide: parsed.data.fromSide as CanvasEdgeSide | undefined,
        id: parsed.data.id,
        label: parsed.data.label,
        toEnd: parsed.data.toEnd as CanvasEdgeEnd,
        toNode: parsed.data.toNode,
        toSide: parsed.data.toSide as CanvasEdgeSide | undefined,
      },
    ];
  });
}

function canvasNodeFromJsonCanvasNode(
  node: JsonCanvasNode,
  assetId: string,
  z: number
): CanvasNode {
  const nodeExtension = recordField(
    recordField(node, BLABLA_EXTENSION_FIELD) ?? {},
    "node"
  );
  return {
    assetId,
    groupId: stringField(nodeExtension ?? {}, "groupId"),
    height: node.height,
    id: node.id,
    rotation: rotationFromJsonCanvasNode(node),
    width: node.width,
    x: node.x,
    y: node.y,
    z: numberField(nodeExtension ?? {}, "z") ?? z,
  };
}

function canvasGroupsFromJsonCanvas(
  raw: JsonCanvasDocument
): Record<string, CanvasGroup> {
  const extension = recordField(raw, BLABLA_EXTENSION_FIELD);
  const groups = Array.isArray(extension?.groups) ? extension.groups : [];
  const entries = groups.flatMap((group): Array<[string, CanvasGroup]> => {
    if (!isRecord(group)) {
      return [];
    }
    const id = stringField(group, "id");
    const type = stringField(group, "type");
    const sourceAssetId = stringField(group, "sourceAssetId");
    const height = numberField(group, "height");
    const rotation = numberField(group, "rotation");
    const width = numberField(group, "width");
    const x = numberField(group, "x");
    const y = numberField(group, "y");
    const z = numberField(group, "z");
    if (
      !(
        id &&
        sourceAssetId &&
        (type === "pdf-pages" || type === "presentation-slides") &&
        height !== undefined &&
        rotation !== undefined &&
        width !== undefined &&
        x !== undefined &&
        y !== undefined &&
        z !== undefined
      )
    ) {
      return [];
    }

    return [
      [
        id,
        {
          height,
          id,
          rotation,
          sourceAssetId,
          sourceNodeId: stringField(group, "sourceNodeId"),
          totalItems: positiveIntegerField(group, "totalItems"),
          type,
          width,
          x,
          y,
          z,
        },
      ],
    ];
  });

  return Object.fromEntries(entries);
}

function applyCanvasAssetExtension(
  asset: CanvasAsset,
  extension: Record<string, unknown> | undefined
): CanvasAsset {
  if (!extension) {
    return asset;
  }

  return {
    ...asset,
    acceptedTextSnapshot:
      stringField(extension, "acceptedTextSnapshot") ??
      asset.acceptedTextSnapshot,
    byteSize: numberField(extension, "byteSize") ?? asset.byteSize,
    height: numberField(extension, "height") ?? asset.height,
    id: stringField(extension, "id") ?? asset.id,
    kind: assetKindField(extension, "kind") ?? asset.kind,
    mediaUrl: stringField(extension, "mediaUrl") ?? asset.mediaUrl,
    mime: stringField(extension, "mime") ?? asset.mime,
    name: stringField(extension, "name") ?? asset.name,
    pageCount: positiveIntegerField(extension, "pageCount") ?? asset.pageCount,
    remoteVideo: recordField(extension, "remoteVideo") as
      | CanvasAsset["remoteVideo"]
      | undefined,
    snapshotUrl: stringField(extension, "snapshotUrl") ?? asset.snapshotUrl,
    sourceAssetId: stringField(extension, "sourceAssetId") ?? asset.sourceAssetId,
    sourceFingerprint:
      stringField(extension, "sourceFingerprint") ?? asset.sourceFingerprint,
    sourceIssue: sourceIssueField(extension, "sourceIssue") ?? asset.sourceIssue,
    sourceIssueIgnoredFingerprint:
      stringField(extension, "sourceIssueIgnoredFingerprint") ??
      asset.sourceIssueIgnoredFingerprint,
    sourceMissingIgnored:
      booleanField(extension, "sourceMissingIgnored") ??
      asset.sourceMissingIgnored,
    sourcePageNumber:
      positiveIntegerField(extension, "sourcePageNumber") ??
      asset.sourcePageNumber,
    textObstacle: textObstacleField(extension, "textObstacle") ?? asset.textObstacle,
    url: stringField(extension, "url") ?? asset.url,
    width: numberField(extension, "width") ?? asset.width,
  };
}

function assetIdForJsonNode(nodeId: string): string {
  return `json-canvas-asset-${nodeId}`;
}

function rotationFromJsonCanvasNode(node: JsonCanvasNode): number {
  const extension = recordField(node, BLABLA_EXTENSION_FIELD);
  const rotation = extension?.rotation;
  return typeof rotation === "number" ? rotation : 0;
}

function stringField(
  node: Record<string, unknown>,
  field: string
): string | undefined {
  const value = node[field];
  return typeof value === "string" ? value : undefined;
}

function numberField(
  node: Record<string, unknown>,
  field: string
): number | undefined {
  const value = node[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function positiveIntegerField(
  node: Record<string, unknown>,
  field: string
): number | undefined {
  const value = numberField(node, field);
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function booleanField(
  node: Record<string, unknown>,
  field: string
): boolean | undefined {
  const value = node[field];
  return typeof value === "boolean" ? value : undefined;
}

function assetKindField(
  node: Record<string, unknown>,
  field: string
): CanvasAsset["kind"] | undefined {
  const value = stringField(node, field);
  return value === "image" ||
    value === "video" ||
    value === "pdf" ||
    value === "presentation" ||
    value === "model" ||
    value === "file"
    ? value
    : undefined;
}

function sourceIssueField(
  node: Record<string, unknown>,
  field: string
): CanvasAsset["sourceIssue"] | undefined {
  const value = recordField(node, field);
  const code = value ? stringField(value, "code") : undefined;
  const message = value ? stringField(value, "message") : undefined;
  const observedAt = value ? stringField(value, "observedAt") : undefined;
  return code &&
    (code === "missing-source" ||
      code === "stale-source" ||
      code === "unsupported-source") &&
    message &&
    observedAt
    ? { code, message, observedAt }
    : undefined;
}

function textObstacleField(
  node: Record<string, unknown>,
  field: string
): CanvasAsset["textObstacle"] | undefined {
  const value = recordField(node, field);
  const height = value ? numberField(value, "height") : undefined;
  const width = value ? numberField(value, "width") : undefined;
  const x = value ? numberField(value, "x") : undefined;
  const y = value ? numberField(value, "y") : undefined;
  return height !== undefined &&
    width !== undefined &&
    x !== undefined &&
    y !== undefined
    ? { height, width, x, y }
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

function jsonCanvasBackgroundStyle(
  node: JsonCanvasNode
): CanvasAsset["jsonCanvasBackgroundStyle"] {
  const style = stringField(node, "backgroundStyle");
  return style === "cover" || style === "ratio" || style === "repeat"
    ? style
    : undefined;
}

function titleFromText(text: string): string | null {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) {
    return null;
  }
  return first.startsWith("# ") ? first.slice(2).trim() || "Text" : first;
}

function fileNameFromPath(file: string): string {
  const normalized = file.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}

function extensionFromFile(file: string): string {
  const name = fileNameFromPath(file).toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function assetKindFromFile(file: string): CanvasAsset["kind"] {
  const extension = extensionFromFile(file);
  if (
    [
      ".apng",
      ".avif",
      ".bmp",
      ".gif",
      ".heic",
      ".jpeg",
      ".jpg",
      ".png",
      ".svg",
      ".webp",
    ].includes(extension)
  ) {
    return "image";
  }
  if ([".mp4", ".mov", ".m4v", ".webm", ".mkv"].includes(extension)) {
    return "video";
  }
  if (extension === ".pdf") {
    return "pdf";
  }
  if ([".ppt", ".pptx", ".pps", ".ppsx"].includes(extension)) {
    return "presentation";
  }
  if ([".glb", ".gltf", ".obj", ".stl"].includes(extension)) {
    return "model";
  }
  return "file";
}

function mimeFromFile(file: string): string {
  const extension = extensionFromFile(file);
  switch (extension) {
    case ".gif":
      return "image/gif";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".md":
      return "text/markdown";
    case ".mp4":
      return "video/mp4";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
