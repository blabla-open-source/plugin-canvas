import { constrainCanvasNodeLayout } from "./node-layout-constraints";
import { createPromotedCanvasAssetPatch } from "./canvas-asset-placement";
import {
  mergeScene,
  type PromotedCanvasAssetInput
} from "./canvas-scene-promoted-assets";
import { nextCanvasSceneTopLevelZ } from "./canvas-scene-reorder";
import type { CanvasCollageThumbnailExport } from "./canvas-collage-render";
import type { CanvasResolvedSourceIssue } from "./canvas-source-status";
import type {
  CanvasGroup,
  CanvasPoint,
  CanvasScene,
  CanvasTextObstacle
} from "./types";

export interface CanvasNodeLayout {
  height: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export type CanvasGroupLayout = Pick<
  CanvasGroup,
  "height" | "rotation" | "width" | "x" | "y"
>;

export interface CanvasNodeLayoutChange {
  layout: CanvasNodeLayout;
  nodeId: string;
}

export function updateNodePosition(
  scene: CanvasScene,
  nodeId: string,
  point: CanvasPoint
): CanvasScene {
  return {
    ...scene,
    nodes: scene.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, x: Math.round(point.x), y: Math.round(point.y) }
        : node
    )
  };
}

export function updateNodeLayout(
  scene: CanvasScene,
  nodeId: string,
  layout: CanvasNodeLayout
): CanvasScene {
  return {
    ...scene,
    nodes: scene.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const constrained = constrainCanvasNodeLayout(
        scene.assets[node.assetId],
        {
          height: Math.max(24, layout.height),
          width: Math.max(24, layout.width)
        }
      );

      return {
        ...node,
        height: constrained.height,
        rotation: layout.rotation,
        width: constrained.width,
        x: layout.x,
        y: layout.y
      };
    })
  };
}

export function updateGroupLayout(
  scene: CanvasScene,
  groupId: string,
  layout: CanvasGroupLayout,
  nodeLayouts: readonly CanvasNodeLayoutChange[] = []
): CanvasScene {
  const group = scene.groups[groupId];
  if (!group) {
    return scene;
  }

  const nodeLayoutById = new Map(
    nodeLayouts.map((nodeLayout) => [nodeLayout.nodeId, nodeLayout.layout])
  );
  let childRight = 0;
  let childBottom = 0;
  let hasChildLayout = false;

  for (const node of scene.nodes) {
    const nodeLayout = nodeLayoutById.get(node.id);
    if (!(nodeLayout && node.groupId === groupId)) {
      continue;
    }

    hasChildLayout = true;
    childRight = Math.max(
      childRight,
      Math.round(nodeLayout.x) + normalizeNodeSize(nodeLayout.width)
    );
    childBottom = Math.max(
      childBottom,
      Math.round(nodeLayout.y) + normalizeNodeSize(nodeLayout.height)
    );
  }

  return {
    ...scene,
    groups: {
      ...scene.groups,
      [groupId]: {
        ...group,
        height: hasChildLayout
          ? normalizeNodeSize(childBottom)
          : normalizeNodeSize(layout.height),
        rotation: layout.rotation,
        width: hasChildLayout
          ? normalizeNodeSize(childRight)
          : normalizeNodeSize(layout.width),
        x: Math.round(layout.x),
        y: Math.round(layout.y)
      }
    },
    nodes:
      nodeLayoutById.size === 0
        ? scene.nodes
        : scene.nodes.map((node) => {
            const nodeLayout = nodeLayoutById.get(node.id);
            return nodeLayout && node.groupId === groupId
              ? {
                  ...node,
                  height: normalizeNodeSize(nodeLayout.height),
                  rotation: nodeLayout.rotation,
                  width: normalizeNodeSize(nodeLayout.width),
                  x: Math.round(nodeLayout.x),
                  y: Math.round(nodeLayout.y)
                }
              : node;
          })
  };
}

export function updateTextDocumentObstacle(
  scene: CanvasScene,
  nodeId: string,
  obstacle: CanvasTextObstacle
): CanvasScene {
  const node = scene.nodes.find((item) => item.id === nodeId);
  const asset = node ? scene.assets[node.assetId] : null;

  if (
    !(
      node &&
      asset &&
      (typeof asset.acceptedTextSnapshot === "string" ||
        typeof asset.textContent === "string")
    )
  ) {
    return scene;
  }

  return {
    ...scene,
    assets: {
      ...scene.assets,
      [asset.id]: {
        ...asset,
        textObstacle: {
          height: normalizeNodeSize(obstacle.height),
          width: normalizeNodeSize(obstacle.width),
          x: Math.round(obstacle.x),
          y: Math.round(obstacle.y)
        }
      }
    }
  };
}

export function acknowledgeCanvasAssetSourceIssue(
  scene: CanvasScene,
  assetId: string,
  issue: CanvasResolvedSourceIssue
): CanvasScene {
  const asset = scene.assets[assetId];
  if (!asset) {
    return scene;
  }

  let nextAsset = asset;
  if (issue.status === "changed" && issue.currentFingerprint) {
    nextAsset = {
      ...asset,
      sourceIssue: undefined,
      sourceIssueIgnoredFingerprint: issue.currentFingerprint,
      sourceMissingIgnored: undefined
    };
  } else if (issue.status === "missing") {
    nextAsset = {
      ...asset,
      sourceIssue: undefined,
      sourceMissingIgnored: true
    };
  } else if (asset.sourceIssue) {
    nextAsset = {
      ...asset,
      sourceIssue: undefined
    };
  }

  if (nextAsset === asset) {
    return scene;
  }

  return {
    ...scene,
    assets: {
      ...scene.assets,
      [assetId]: nextAsset
    }
  };
}

export function clearCanvasAssetSourceIssue(
  scene: CanvasScene,
  assetId: string
): CanvasScene {
  const asset = scene.assets[assetId];
  if (!asset?.sourceIssue) {
    return scene;
  }

  return {
    ...scene,
    assets: {
      ...scene.assets,
      [assetId]: {
        ...asset,
        sourceIssue: undefined
      }
    }
  };
}

export function revokeCanvasSceneAssetUrls(scene: CanvasScene): void {
  for (const asset of Object.values(scene.assets)) {
    if (asset.url?.startsWith("blob:")) {
      URL.revokeObjectURL(asset.url);
    }
  }
}

export function createDebugFileNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 220,
      kind: "file",
      mime: "application/pdf",
      name: `Referenced file ${scene.nodes.length + 1}.pdf`,
      width: 320
    })
  ]);
}

export function createDebugTextNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      acceptedTextSnapshot:
        "# Meeting notes\nThe plugin owns the CanvasScene and document JSON. The host will provide file references and material URLs later.\n\nThis card uses the old text document visual model. Drag the inset block to verify text wrapping stays owned by the canvas asset.",
      byteSize: 188,
      height: 300,
      kind: "file",
      mime: "text/markdown",
      name: `Text snapshot ${scene.nodes.length + 1}.md`,
      textObstacle: {
        height: 86,
        width: 138,
        x: 250,
        y: 96
      },
      width: 420
    })
  ]);
}

export function createDebugPreviewNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 260,
      kind: "image",
      mime: "image/svg+xml",
      name: `Preview asset ${scene.nodes.length + 1}.svg`,
      url: SAMPLE_PREVIEW_URL,
      width: 420
    })
  ]);
}

export function createDebugVideoNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 360,
      kind: "video",
      mediaUrl: SAMPLE_VIDEO_URL,
      mime: "video/mp4",
      name: `Video clip ${scene.nodes.length + 1}.mp4`,
      url: SAMPLE_VIDEO_POSTER_URL,
      width: 640
    })
  ]);
}

export function createDebugModelNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 360,
      kind: "model",
      mediaUrl: SAMPLE_MODEL_STL_URL,
      mime: "model/stl",
      name: `Demo model ${scene.nodes.length + 1}.stl`,
      url: SAMPLE_MODEL_POSTER_URL,
      width: 640
    })
  ]);
}

export function createDebugPdfSourceNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 360,
      kind: "pdf",
      mime: "application/pdf",
      name: `Demo PDF ${scene.nodes.length + 1}.pdf`,
      pageCount: 6,
      url: SAMPLE_PAGE_URLS[0] ?? SAMPLE_PREVIEW_URL,
      width: 260
    })
  ]);
}

export function createDebugPresentationSourceNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 292,
      kind: "presentation",
      mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      name: `Demo deck ${scene.nodes.length + 1}.pptx`,
      pageCount: 5,
      url: SAMPLE_PREVIEW_URL,
      width: 520
    })
  ]);
}

export function createDebugRemoteVideoNode(
  scene: CanvasScene,
  point: CanvasPoint
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: 360,
      kind: "video",
      mime: "video/remote",
      name: `Remote video ${scene.nodes.length + 1}`,
      remoteVideo: {
        embedUrl: SAMPLE_REMOTE_VIDEO_EMBED_URL,
        provider: "generic",
        thumbnailUrl: SAMPLE_REMOTE_VIDEO_POSTER_URL,
        title: "Remote video",
        url: "https://example.com/remote-video"
      },
      url: SAMPLE_REMOTE_VIDEO_POSTER_URL,
      width: 640
    })
  ]);
}

export function createCollageThumbnailNode(
  scene: CanvasScene,
  point: CanvasPoint,
  thumbnail: CanvasCollageThumbnailExport
): CanvasScene {
  return appendPromotedAssets(scene, point, [
    createDebugPromotedAsset(scene, {
      height: thumbnail.height,
      kind: "image",
      mime: "image/webp",
      name: `Canvas collage ${scene.nodes.length + 1}.webp`,
      sourceAssetId: `generated-collage-${crypto.randomUUID()}`,
      url: thumbnail.dataUrl,
      width: thumbnail.width
    })
  ]);
}

function appendPromotedAssets(
  scene: CanvasScene,
  point: CanvasPoint,
  promotedAssets: PromotedCanvasAssetInput[]
): CanvasScene {
  const patch = createPromotedCanvasAssetPatch({
    point,
    promotedAssets,
    startZ: nextCanvasSceneTopLevelZ(scene)
  });

  return mergeScene(scene, patch);
}

function createDebugPromotedAsset(
  scene: CanvasScene,
  input: Omit<PromotedCanvasAssetInput, "id" | "sourceAssetId"> & {
    sourceAssetId?: string;
  }
): PromotedCanvasAssetInput {
  const assetId = `asset-${crypto.randomUUID()}`;
  const sourceAssetId = input.sourceAssetId ?? `source-${assetId}`;

  return {
    ...input,
    id: assetId,
    sourceAssetId,
    sourceFingerprint: `debug:${sourceAssetId}:${scene.nodes.length}`
  };
}

const SAMPLE_PREVIEW_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 840 520'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23f8fafc'/%3E%3Cstop offset='1' stop-color='%23d1fae5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='840' height='520' fill='url(%23g)'/%3E%3Crect x='72' y='72' width='696' height='376' rx='18' fill='%23ffffff' stroke='%23cccccc'/%3E%3Ccircle cx='168' cy='178' r='54' fill='%2310b981'/%3E%3Cpath d='M258 154h330v28H258zm0 58h430v22H258zm0 46h372v22H258z' fill='%231d1d1f'/%3E%3Cpath d='M112 370l142-116 116 84 92-68 266 100v52H112z' fill='%2394a3b8' opacity='.55'/%3E%3C/svg%3E";

const SAMPLE_VIDEO_URL =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const SAMPLE_VIDEO_POSTER_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23111827'/%3E%3Ccircle cx='320' cy='180' r='64' fill='%23ffffff' opacity='.92'/%3E%3Cpath d='M302 142v76l68-38z' fill='%23111827'/%3E%3Cpath d='M54 296h532v18H54z' fill='%23ffffff' opacity='.28'/%3E%3Cpath d='M54 296h180v18H54z' fill='%2310b981'/%3E%3C/svg%3E";
const SAMPLE_REMOTE_VIDEO_POSTER_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%230f172a'/%3E%3Crect x='48' y='46' width='544' height='268' rx='18' fill='%231e293b' stroke='%23475569'/%3E%3Ccircle cx='320' cy='180' r='62' fill='%23ef4444'/%3E%3Cpath d='M302 142v76l70-38z' fill='%23ffffff'/%3E%3Cpath d='M78 82h210v20H78zm0 196h360v16H78z' fill='%23cbd5e1' opacity='.75'/%3E%3C/svg%3E";
const SAMPLE_REMOTE_VIDEO_EMBED_URL =
  "data:text/html,%3C!doctype%20html%3E%3Chtml%3E%3Cbody%20style%3D%22margin%3A0%3Bheight%3A100vh%3Bdisplay%3Agrid%3Bplace-items%3Acenter%3Bbackground%3A%230f172a%3Bcolor%3Awhite%3Bfont%3A600%2020px%20system-ui%2Csans-serif%3B%22%3ERemote%20video%20embed%3C%2Fbody%3E%3C%2Fhtml%3E";
const SAMPLE_MODEL_POSTER_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f8fafc'/%3E%3Crect x='66' y='44' width='508' height='272' rx='18' fill='%23ffffff' stroke='%23cbd5e1'/%3E%3Cpath d='M320 84l142 82v164l-142 82-142-82V166z' transform='translate(0 -44)' fill='%23dbeafe' stroke='%230f172a' stroke-width='10'/%3E%3Cpath d='M320 40v164m0 0l142-82M320 204L178 122' transform='translate(0 0)' fill='none' stroke='%2310b981' stroke-width='10' stroke-linecap='round'/%3E%3Cpath d='M116 290h408v18H116z' fill='%23cbd5e1'/%3E%3C/svg%3E";
const SAMPLE_MODEL_STL_URL =
  "data:model/stl,solid%20tetra%0A%20facet%20normal%200%200%201%0A%20%20outer%20loop%0A%20%20%20vertex%200%200%200%0A%20%20%20vertex%201%200%200%0A%20%20%20vertex%200%201%200%0A%20%20endloop%0A%20endfacet%0A%20facet%20normal%200%20-1%200%0A%20%20outer%20loop%0A%20%20%20vertex%200%200%200%0A%20%20%20vertex%200%200%201%0A%20%20%20vertex%201%200%200%0A%20%20endloop%0A%20endfacet%0A%20facet%20normal%201%201%201%0A%20%20outer%20loop%0A%20%20%20vertex%201%200%200%0A%20%20%20vertex%200%200%201%0A%20%20%20vertex%200%201%200%0A%20%20endloop%0A%20endfacet%0A%20facet%20normal%20-1%200%200%0A%20%20outer%20loop%0A%20%20%20vertex%200%200%200%0A%20%20%20vertex%200%201%200%0A%20%20%20vertex%200%200%201%0A%20%20endloop%0A%20endfacet%0Aendsolid%20tetra";

const SAMPLE_PAGE_URLS = [
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 360'%3E%3Crect width='260' height='360' fill='%23ffffff'/%3E%3Crect x='28' y='32' width='204' height='32' rx='4' fill='%2310b981'/%3E%3Cpath d='M32 98h196v14H32zm0 34h168v14H32zm0 34h188v14H32zm0 34h150v14H32z' fill='%2327272a'/%3E%3Crect x='32' y='252' width='196' height='70' rx='6' fill='%23d1fae5'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 360'%3E%3Crect width='260' height='360' fill='%23fff7ed'/%3E%3Ccircle cx='84' cy='114' r='42' fill='%23fb923c'/%3E%3Ccircle cx='172' cy='114' r='42' fill='%230ea5e9'/%3E%3Cpath d='M42 210h176v18H42zm0 42h128v18H42z' fill='%2327272a'/%3E%3Crect x='42' y='300' width='82' height='18' rx='9' fill='%2310b981'/%3E%3C/svg%3E",
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 260 360'%3E%3Crect width='260' height='360' fill='%23f8fafc'/%3E%3Crect x='32' y='46' width='196' height='124' rx='10' fill='%23e0f2fe'/%3E%3Cpath d='M52 244h156v16H52zm0 38h190v16H52z' fill='%2327272a'/%3E%3Cpath d='M58 144l50-54 38 34 22-26 36 46z' fill='%230ea5e9'/%3E%3C/svg%3E"
];

function normalizeNodeSize(value: number): number {
  return Math.max(24, Math.round(value));
}
