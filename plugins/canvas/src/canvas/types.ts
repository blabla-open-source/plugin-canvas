export const CANVAS_ASSET_KINDS = [
  "image",
  "video",
  "pdf",
  "presentation",
  "model",
  "file"
] as const;

export type AssetKind = (typeof CANVAS_ASSET_KINDS)[number];

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface CanvasRemoteVideo {
  authorName?: string;
  authorUrl?: string;
  canonicalUrl?: string;
  duration?: number;
  embedUrl: string;
  height?: number;
  metadataCapturedAt?: string;
  originalUrl?: string;
  provider: "bilibili" | "generic" | "vimeo" | "youtube";
  providerTags?: string[];
  publishedAt?: string;
  statistics?: {
    coinCount?: number;
    commentCount?: number;
    favoriteCount?: number;
    likeCount?: number;
    shareCount?: number;
    viewCount?: number;
  };
  thumbnailHeight?: number;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  title?: string;
  url?: string;
  videoId?: string;
  width?: number;
}

export interface CanvasTextObstacle {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CanvasAssetSourceIssue {
  code: "missing-source" | "stale-source" | "unsupported-source";
  message: string;
  observedAt: string;
}

export interface CanvasAsset {
  acceptedTextSnapshot?: string;
  aspectRatio?: number;
  byteSize?: number;
  createdAt?: string;
  height: number;
  id: string;
  jsonCanvasBackground?: string;
  jsonCanvasBackgroundStyle?: "cover" | "ratio" | "repeat";
  jsonCanvasColor?: string;
  jsonCanvasFile?: string;
  jsonCanvasLabel?: string;
  jsonCanvasNodeType?: string;
  jsonCanvasSubpath?: string;
  jsonCanvasUrl?: string;
  kind: AssetKind;
  mediaUrl?: string;
  mime: string;
  name: string;
  pageCount?: number;
  remoteVideo?: CanvasRemoteVideo;
  runtimeOnly?: boolean;
  snapshotUrl?: string;
  sourceAssetId?: string;
  sourceFingerprint?: string;
  sourceIssue?: CanvasAssetSourceIssue;
  sourceIssueIgnoredFingerprint?: string;
  sourceMissingIgnored?: boolean;
  sourcePageNumber?: number;
  textContent?: string;
  textObstacle?: CanvasTextObstacle;
  thumbnailUrl?: string;
  updatedAt?: string;
  url?: string;
  width: number;
}

export interface CanvasGroup {
  height: number;
  id: string;
  rotation: number;
  runtimeOnly?: boolean;
  sourceAssetId: string;
  sourceNodeId?: string;
  totalItems?: number;
  type: "pdf-pages" | "presentation-slides";
  width: number;
  x: number;
  y: number;
  z: number;
}

export interface CanvasNode {
  assetId: string;
  groupId?: string;
  height: number;
  id: string;
  rotation: number;
  width: number;
  x: number;
  y: number;
  z: number;
}

export type CanvasEdgeSide = "bottom" | "left" | "right" | "top";
export type CanvasEdgeEnd = "arrow" | "none";

export interface CanvasEdge {
  color?: string;
  fromEnd: CanvasEdgeEnd;
  fromNode: string;
  fromSide?: CanvasEdgeSide;
  id: string;
  label?: string;
  toEnd: CanvasEdgeEnd;
  toNode: string;
  toSide?: CanvasEdgeSide;
}

export interface CanvasScene {
  assets: Record<string, CanvasAsset>;
  edges?: CanvasEdge[];
  groups: Record<string, CanvasGroup>;
  nodes: CanvasNode[];
}

export interface CanvasFileReferenceShelfState {
  collapsed: boolean;
  selectedFileIds: string[];
  width: number;
}
