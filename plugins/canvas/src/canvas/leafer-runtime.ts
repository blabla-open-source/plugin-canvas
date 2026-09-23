import {
  EditorMoveEvent,
  EditorScaleEvent,
  InnerEditor
} from "@leafer-in/editor";
import "@leafer-in/arrow";
import "@leafer-in/scroller";
import "@leafer-in/viewport";
import {
  App,
  Box,
  DragEvent,
  Group,
  type IEditorMoveData,
  type IEditorScaleData,
  type ILeafer,
  type IUI,
  MoveEvent,
  Path,
  Rect,
  Text,
  ZoomEvent,
} from "leafer-ui";
import {
  createImageFill,
  isPreviewBackedAsset,
  previewUrlForAsset
} from "./canvas-asset-rendering";
import { CanvasAssetInteractionController } from "./canvas-asset-interactions";
import {
  computeCanvasMoveSnap,
  computeCanvasScaleSnap,
  DEFAULT_CANVAS_SNAP_THRESHOLD,
  filterCanvasSnapBoxesByBounds,
  type CanvasMoveSnapResult,
  type CanvasScaleSnapResult,
  type CanvasSnapBounds,
  type CanvasSnapBox,
  type CanvasSnapLine
} from "./canvas-snapping";
import {
  documentMetaText,
  isTextDocumentAsset,
  layoutTextDocumentLines,
  TEXT_DOCUMENT_BODY_TYPE,
  TEXT_DOCUMENT_FONT_FAMILY,
  TEXT_DOCUMENT_HEADER_HEIGHT,
  TEXT_DOCUMENT_META_TYPE,
  TEXT_DOCUMENT_PADDING,
  TEXT_DOCUMENT_SCROLL_EDITOR_TAG,
  TEXT_DOCUMENT_TITLE_TYPE,
  type TextDocumentBodyLine,
  clampTextDocumentObstacle,
  textDocumentContent,
  textDocumentLayoutHash,
  textDocumentObstacle
} from "./canvas-text-document-model";
import {
  canvasWheelMove,
  canvasWheelScale,
  WHEEL_ZOOM_SPEED
} from "./canvas-wheel";
import {
  groupSnapBoxId,
  nodeSnapBoxId,
  readElementClientRect,
  readElementSnapBox,
  readGroupLayout,
  readNodeLayout,
  scaleOriginPoint
} from "./leafer-runtime-geometry";
import { planLiveEditorTargetSync } from "./leafer-editor-targets";
import * as runtimeGroup from "./leafer-runtime-group";
import { installCanvasSnappingTransformTool } from "./leafer-snapping-transform-tool";
import {
  canvasAssetMinimumNodeSize,
  type CanvasNodeMinimumSize
} from "./node-layout-constraints";
import type {
  CanvasGroupLayout,
  CanvasNodeLayout,
  CanvasNodeLayoutChange as CanvasNodeLayoutChangeShape
} from "./scene-store";
import type { CanvasSceneTargets } from "./canvas-scene-targets";
import type {
  CanvasAsset,
  CanvasEdge,
  CanvasEdgeSide,
  CanvasGroup,
  CanvasTextObstacle,
  CanvasNode,
  CanvasPoint,
  CanvasScene,
  CanvasViewport
} from "./types";
import { MIN_ZOOM, setLeaferViewport, readLeaferViewport, leaferClientPoint, forwardCanvasWheel, type CanvasWheelInput } from "./leafer-viewport";
import { colorTokens, typographyTokens } from "./visual-tokens";

export type CanvasNodeLayoutChange = CanvasNodeLayoutChangeShape;

const SNAP_INDICATOR_Z_INDEX = 1_000_000_000;
const JSON_CANVAS_EDGE_LAYER_Z_INDEX = 0.5;
const JSON_CANVAS_EDGE_STROKE_WIDTH = 3;
const JSON_CANVAS_TEXT_PADDING = 24;
const JSON_CANVAS_TEXT_TITLE_FONT_SIZE = 20;
const JSON_CANVAS_TEXT_TITLE_LINE_HEIGHT = 28;
const JSON_CANVAS_TEXT_BODY_FONT_SIZE = 15;
const JSON_CANVAS_TEXT_BODY_LINE_HEIGHT = 22;
const FILE_CARD_TITLE_TYPE = typographyTokens.nav;
const FILE_CARD_META_TYPE = typographyTokens.meta;
const CARD_RADIUS = 8;
const ASSET_ACTION_COLOR_FALLBACK = "#10b981";
const ASSET_ACTION_COLOR_VARIABLE = "--asset-action";
const elementGroupIds = new WeakMap<IUI, string>();
const elementNodeIds = new WeakMap<IUI, string>();

type NodeLayoutHandler = (
  nodeId: string,
  layout: CanvasNodeLayout,
  transient: boolean
) => void;

type GroupLayoutHandler = (
  groupId: string,
  layout: CanvasGroupLayout,
  nodeLayouts: readonly CanvasNodeLayoutChange[],
  transient: boolean
) => void;

type TextDocumentObstacleLayoutHandler = (
  nodeId: string,
  obstacle: CanvasTextObstacle,
  transient: boolean
) => void;

export interface CanvasSceneContextMenuEvent {
  clientX: number;
  clientY: number;
  targets: CanvasSceneTargets;
}

interface TextDocumentCallbacks {
  onObstacleLayout: TextDocumentObstacleLayoutHandler;
  onObstacleTransformEnd: () => void;
  onObstacleTransformStart: () => void;
}

interface TextDocumentElementState {
  background: Rect;
  body: Box;
  callbacks: TextDocumentCallbacks;
  divider: Rect;
  layoutHash: string;
  lineTexts: Text[];
  meta: Text;
  obstacle: Box;
  obstacleDragStart: {
    obstacle: CanvasTextObstacle;
    scrollY: number;
  } | null;
  scrollModeActive: boolean;
  title: Text;
}

const textDocumentStates = new WeakMap<IUI, TextDocumentElementState>();

class TextDocumentScrollInnerEditor extends InnerEditor {
  get tag() {
    return TEXT_DOCUMENT_SCROLL_EDITOR_TAG;
  }

  get mode() {
    return "both" as const;
  }

  onLoad(): void {
    const state = textDocumentStates.get(this.editTarget);
    if (!state) {
      return;
    }

    state.body.set({ overflow: "y-scroll" } as never);
    state.scrollModeActive = true;
  }

  onUnload(): void {
    const state = textDocumentStates.get(this.editTarget);
    if (!state) {
      return;
    }

    state.body.set({ overflow: "hide" } as never);
    state.scrollModeActive = false;
  }
}

const canvasInnerEditorRegistry = globalThis as typeof globalThis & {
  __blablaCanvasTextDocumentScrollInnerEditorRegistered?: boolean;
};

if (!canvasInnerEditorRegistry.__blablaCanvasTextDocumentScrollInnerEditorRegistered) {
  TextDocumentScrollInnerEditor.registerInnerEditor();
  canvasInnerEditorRegistry.__blablaCanvasTextDocumentScrollInnerEditorRegistered =
    true;
}

interface LeaferCanvasRuntimeOptions {
  initialViewport?: CanvasViewport;
  onEditorTransformEnd?: () => void;
  onEditorTransformStart?: () => void;
  onGroupLayout?: GroupLayoutHandler;
  onModelToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onRemoteVideoToggle?: (nodeId: string, asset: CanvasAsset) => void;
  onTextDocumentObstacleLayout?: TextDocumentObstacleLayoutHandler;
  onTextDocumentObstacleTransformEnd?: () => void;
  onTextDocumentObstacleTransformStart?: () => void;
  onViewportChange?: (viewport: CanvasViewport) => void;
}

interface RenderedNode {
  interactionElement: IUI | null;
  renderKey: string;
  root: Group;
}

interface CanvasRuntimeTheme {
  accent: string;
  assetAction: string;
  border: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  surface: string;
}

interface JsonCanvasColorStyle {
  fill: string;
  mutedText: string;
  stroke: string;
  text: string;
}

export class LeaferCanvasRuntime {
  private readonly app: App;
  private readonly assetInteractions: CanvasAssetInteractionController;
  private readonly edgeLayer: Group;
  private readonly elementMinimumSizes = new Map<
    string,
    CanvasNodeMinimumSize
  >();
  private readonly elements = new Map<string, RenderedNode>();
  private editorTransformActive = false;
  private readonly groups = new Map<string, Group>();
  private readonly onEditorTransformEnd: (() => void) | null;
  private readonly onEditorTransformStart: (() => void) | null;
  private readonly onGroupLayout: GroupLayoutHandler | null;
  private readonly onTextDocumentObstacleLayout: TextDocumentObstacleLayoutHandler | null;
  private readonly onTextDocumentObstacleTransformEnd: (() => void) | null;
  private readonly onTextDocumentObstacleTransformStart: (() => void) | null;
  private readonly snapIndicatorLayer: Group;
  private viewportFrameId: number | null = null;
  private readonly onNodeLayout: NodeLayoutHandler;
  private readonly onViewportChange: ((viewport: CanvasViewport) => void) | null;
  private readonly themeObserver: MutationObserver | null;
  private readonly tree: ILeafer;
  private readonly view: HTMLElement;
  private lastScene: CanvasScene | null = null;
  private themeRevision = 0;

  constructor(
    view: HTMLElement,
    onNodeLayout: NodeLayoutHandler,
    options: LeaferCanvasRuntimeOptions = {}
  ) {
    this.view = view;
    this.onNodeLayout = onNodeLayout;
    this.onEditorTransformEnd = options.onEditorTransformEnd ?? null;
    this.onEditorTransformStart = options.onEditorTransformStart ?? null;
    this.onGroupLayout = options.onGroupLayout ?? null;
    this.onTextDocumentObstacleLayout =
      options.onTextDocumentObstacleLayout ?? null;
    this.onTextDocumentObstacleTransformEnd =
      options.onTextDocumentObstacleTransformEnd ?? null;
    this.onTextDocumentObstacleTransformStart =
      options.onTextDocumentObstacleTransformStart ?? null;
    this.onViewportChange = options.onViewportChange ?? null;
    this.app = new App({
      editor: {
        beforeMove: this.handleEditorBeforeMove,
        beforeScale: this.handleEditorBeforeScale,
        editSize: "size",
        flipable: false,
        lockRatio: "corner",
        rotateable: false,
        skewable: false,
        stroke: readCssColorVariable(view, ASSET_ACTION_COLOR_VARIABLE)
      },
      move: {
        holdMiddleKey: true,
        holdSpaceKey: true
      },
      smooth: true,
      tree: { type: "viewport" },
      view,
      wheel: {
        getMove: canvasWheelMove,
        getScale: canvasWheelScale,
        preventDefault: true,
        zoomSpeed: WHEEL_ZOOM_SPEED
      }
    } as never);
    installCanvasSnappingTransformTool(this.app.editor);
    this.tree = this.app.tree;
    this.edgeLayer = createJsonCanvasEdgeLayer();
    this.tree.add(this.edgeLayer);
    this.assetInteractions = new CanvasAssetInteractionController({
      getImageDirectRendering: () => false,
      getVideoPlaybackMuted: () => true,
      onModelToggle: options.onModelToggle,
      onRemoteVideoToggle: options.onRemoteVideoToggle,
      view
    });
    this.snapIndicatorLayer = createSnapIndicatorLayer();
    this.tree.add(this.snapIndicatorLayer);
    this.themeObserver = createThemeObserver(view, this.updateEditorTheme);

    if (options.initialViewport) {
      this.setViewport(options.initialViewport);
    }

    this.tree.on(MoveEvent.MOVE, this.handleViewportChange);
    this.tree.on(MoveEvent.DRAG_ANIMATE, this.handleViewportChange);
    this.tree.on(MoveEvent.END, this.handleViewportChange);
    this.tree.on(ZoomEvent.ZOOM, this.handleViewportChange);
    this.tree.on(ZoomEvent.END, this.handleViewportChange);
    this.app.on(DragEvent.START, this.handleEditorTransformStart);
    this.app.on(DragEvent.END, this.handleEditorTransformEnd);
    this.app.on(MoveEvent.START, this.handleEditorTransformStart);
    this.app.on(MoveEvent.END, this.handleEditorTransformEnd);
    this.app.editor.on(EditorMoveEvent.MOVE, this.handleEditorTransform);
    this.app.editor.on(EditorScaleEvent.SCALE, this.handleEditorTransform);
    this.publishViewport();
  }

  sync(scene: CanvasScene): void {
    this.lastScene = scene;
    const liveGroupIds = new Set(Object.keys(scene.groups));
    const liveNodeIds = new Set(scene.nodes.map((node) => node.id));

    const editorTargetSync = planLiveEditorTargetSync({
      liveGroupIds,
      liveNodeIds,
      readGroupId,
      readNodeId,
      targets: this.editorTargets(),
    });
    if (editorTargetSync.kind !== "unchanged") {
      this.clearSnapIndicators();
    }
    if (editorTargetSync.kind === "clear") {
      this.app.editor.cancel();
    } else if (editorTargetSync.kind === "select") {
      this.app.editor.select(editorTargetSync.targets);
    }

    for (const group of Object.values(scene.groups)) {
      const existing = this.groups.get(group.id);

      if (existing) {
        runtimeGroup.updateLeaferGroupElement(existing, group);
        continue;
      }

      this.addGroupElement(group);
    }

    for (const [nodeId, rendered] of this.elements) {
      if (!liveNodeIds.has(nodeId)) {
        this.assetInteractions.release(nodeId, false);
        rendered.root.remove();
        this.elementMinimumSizes.delete(nodeId);
        this.elements.delete(nodeId);
      }
    }

    const sortedNodes = [...scene.nodes].sort((left, right) => left.z - right.z);

    for (const node of sortedNodes) {
      const asset = scene.assets[node.assetId];

      if (!asset) {
        continue;
      }

      this.syncNode(node, asset);
      const rendered = this.elements.get(node.id);
      if (rendered) {
        this.attachElementToParent(rendered.root, node.groupId);
      }
    }

    for (const [groupId, groupElement] of this.groups) {
      if (!liveGroupIds.has(groupId)) {
        groupElement.remove();
        this.groups.delete(groupId);
      }
    }

    this.syncJsonCanvasEdges(scene);
  }

  getViewport(): CanvasViewport {
    return this.currentViewport();
  }

  getElementClientRect(nodeId: string) {
    const rendered = this.elements.get(nodeId);
    return rendered ? readElementClientRect(rendered.root, this.view) : null;
  }

  selectedTargets(): CanvasSceneTargets {
    const groupIds = new Set<string>();
    const nodeIds = new Set<string>();

    for (const target of this.editorTargets()) {
      const groupId = readGroupId(target);
      if (groupId) {
        groupIds.add(groupId);
        continue;
      }

      const nodeId = readNodeId(target);
      if (nodeId) {
        nodeIds.add(nodeId);
      }
    }

    return {
      groupIds: Array.from(groupIds),
      nodeIds: Array.from(nodeIds)
    };
  }

  isVideoPlaybackActive(nodeId: string): boolean {
    return this.assetInteractions.hasActiveInteraction(nodeId);
  }

  toggleVideoPlayback(nodeId: string, asset: CanvasAsset): boolean {
    const rendered = this.elements.get(nodeId);
    if (!rendered?.interactionElement) {
      return false;
    }

    return this.assetInteractions.toggleVideoPlayback(
      nodeId,
      asset,
      rendered.interactionElement
    );
  }

  setViewport(viewport: CanvasViewport): void {
    setLeaferViewport(this.tree, viewport);
  }

  clientToCanvasPoint(clientX: number, clientY: number): CanvasPoint {
    return leaferClientPoint(this.tree, this.view, clientX, clientY);
  }

  forwardWheel(input: CanvasWheelInput): void {
    forwardCanvasWheel(this.tree, input);
  }

  destroy(): void {
    if (this.viewportFrameId !== null) {
      window.cancelAnimationFrame(this.viewportFrameId);
      this.viewportFrameId = null;
    }

    this.assetInteractions.destroy();
    this.themeObserver?.disconnect();
    this.app.destroy(true);
    this.edgeLayer.removeAll(true);
    this.elementMinimumSizes.clear();
    this.elements.clear();
    this.groups.clear();
  }

  private syncNode(node: CanvasNode, asset: CanvasAsset): void {
    const renderKey = `${nodeRenderKey(node, asset)}|theme:${this.themeRevision}`;
    const theme = readCanvasRuntimeTheme(this.view);
    let rendered = this.elements.get(node.id);

    if (!rendered) {
      rendered = {
        interactionElement: null,
        renderKey: "",
        root: new Box({
          editable: true,
          fill: "transparent",
          hitChildren: true,
          hitSelf: true,
          id: node.id
        } as never)
      };
      this.elements.set(node.id, rendered);
      elementNodeIds.set(rendered.root, node.id);
      this.tree.add(rendered.root);
    }

    const previewUrl = previewUrlForAsset(asset);
    const minimumSize = canvasAssetMinimumNodeSize(asset);
    rendered.root.set({
      ...runtimeGroup.leaferNodeRuntimeState(asset),
      heightRange: minimumSize ? { min: minimumSize.height } : undefined,
      height: node.height,
      lockRatio: Boolean(previewUrl && isPreviewBackedAsset(asset)),
      rotation: node.rotation,
      scaleX: 1,
      scaleY: 1,
      widthRange: minimumSize ? { min: minimumSize.width } : undefined,
      width: node.width,
      x: node.x,
      y: node.y,
      zIndex: node.z
    } as never);

    if (rendered.renderKey !== renderKey) {
      this.assetInteractions.release(node.id, false);
      rendered.root.removeAll();
      rendered.interactionElement = renderNodeContent(
        rendered.root,
        node,
        asset,
        {
          onTextDocumentObstacleLayout: this.onTextDocumentObstacleLayout,
          onTextDocumentObstacleTransformEnd:
            this.onTextDocumentObstacleTransformEnd,
          onTextDocumentObstacleTransformStart:
            this.onTextDocumentObstacleTransformStart,
          theme
        }
      );
      rendered.renderKey = renderKey;
    }

    if (isTextDocumentAsset(asset) && !isJsonCanvasTextAsset(asset)) {
      applyTextDocumentLayout(rendered.root, node, asset, theme);
    }

    if (asset.runtimeOnly) {
      this.assetInteractions.release(node.id, false);
    } else {
      this.assetInteractions.sync(node.id, asset, rendered.interactionElement);
    }
    this.syncNodeMinimumSize(node.id, minimumSize);
  }

  private syncJsonCanvasEdges(scene: CanvasScene): void {
    this.edgeLayer.removeAll(true);

    const edges = scene.edges ?? [];
    if (edges.length === 0) {
      this.edgeLayer.set({ visible: false });
      return;
    }

    const nodeById = new Map(scene.nodes.map((node) => [node.id, node]));
    const theme = readCanvasRuntimeTheme(this.view);
    let renderedCount = 0;

    for (const edge of edges) {
      const fromNode = nodeById.get(edge.fromNode);
      const toNode = nodeById.get(edge.toNode);
      if (!(fromNode && toNode)) {
        continue;
      }

      const edgeElement = renderJsonCanvasEdgeElement({
        edge,
        from: absoluteNodeRect(scene, fromNode),
        theme,
        to: absoluteNodeRect(scene, toNode)
      });
      this.edgeLayer.add(edgeElement);
      renderedCount += 1;
    }

    this.edgeLayer.set({
      visible: renderedCount > 0,
      zIndex: jsonCanvasEdgeLayerZIndex(scene)
    } as never);
  }

  private addGroupElement(group: CanvasGroup): void {
    const element = new Group({
      ...runtimeGroup.leaferGroupRuntimeState(group),
      height: group.height,
      hitChildren: false,
      rotation: group.rotation,
      width: group.width,
      x: group.x,
      y: group.y,
      zIndex: group.z
    } as never);

    elementGroupIds.set(element, group.id);
    this.groups.set(group.id, element);
    this.tree.add(element);
  }

  private readonly handleViewportChange = (): void => {
    this.requestViewportPublish();
  };

  private readonly handleEditorBeforeMove = (data: IEditorMoveData) => {
    const snap = this.computeEditorMoveSnap(data.x, data.y);

    if (!snap) {
      return true;
    }

    this.renderSnapIndicators(snap);

    if (snap.nudgeX === 0 && snap.nudgeY === 0) {
      return true;
    }

    return {
      x: data.x + snap.nudgeX,
      y: data.y + snap.nudgeY
    };
  };

  private readonly handleEditorBeforeScale = (data: IEditorScaleData) => {
    const snap = this.computeEditorScaleSnap(data);
    let scaleX = snap?.scaleX ?? data.scaleX;
    let scaleY = snap?.scaleY ?? data.scaleY;
    const constrainedScale = this.constrainScaleToMinimumNodeSize(
      data,
      scaleX,
      scaleY
    );
    const constrained = !(
      nearlyEqual(constrainedScale.scaleX, scaleX) &&
      nearlyEqual(constrainedScale.scaleY, scaleY)
    );

    scaleX = constrainedScale.scaleX;
    scaleY = constrainedScale.scaleY;

    if (constrained) {
      this.clearSnapIndicators();
    } else if (snap) {
      this.renderSnapIndicators(snap);
    }

    if (nearlyEqual(scaleX, data.scaleX) && nearlyEqual(scaleY, data.scaleY)) {
      return true;
    }

    return {
      scaleX,
      scaleY
    };
  };

  private readonly handleEditorTransformStart = (): void => {
    if (this.editorTransformActive || this.editorTargets().length === 0) {
      this.clearSnapIndicators();
      return;
    }

    this.clearSnapIndicators();
    this.editorTransformActive = true;
    this.onEditorTransformStart?.();
  };

  private readonly handleEditorTransform = (): void => {
    for (const target of this.editorTargets()) {
      const groupId = readGroupId(target);
      if (groupId) {
        this.onGroupLayout?.(
          groupId,
          readGroupLayout(target),
          this.readGroupChildNodeLayouts(target),
          this.editorTransformActive
        );
        continue;
      }

      const nodeId = readNodeId(target);

      if (nodeId) {
        this.onNodeLayout(
          nodeId,
          readNodeLayout(target),
          this.editorTransformActive
        );
      }
    }
  };

  private readonly handleEditorTransformEnd = (): void => {
    if (!this.editorTransformActive) {
      this.clearSnapIndicators();
      return;
    }

    this.handleEditorTransform();
    this.clearSnapIndicators();
    this.editorTransformActive = false;
    this.onEditorTransformEnd?.();
  };

  private readonly updateEditorTheme = (): void => {
    const assetActionColor = readCssColorVariable(
      this.view,
      ASSET_ACTION_COLOR_VARIABLE
    );
    this.app.editor.config.stroke = assetActionColor;

    if (this.app.editor.editing) {
      this.app.editor.editBox.load();
      this.app.editor.editBox.update();
    }

    this.themeRevision += 1;
    if (this.lastScene) {
      this.sync(this.lastScene);
    }
  };

  private editorTargets(): IUI[] {
    const target = this.app.editor.target;

    if (!target) {
      return [];
    }

    return Array.isArray(target) ? target : [target as IUI];
  }

  private currentViewport(): CanvasViewport {
    return readLeaferViewport(this.tree);
  }

  private publishViewport(): void {
    this.onViewportChange?.(this.currentViewport());
  }

  private requestViewportPublish(): void {
    if (!this.onViewportChange || this.viewportFrameId !== null) {
      return;
    }

    this.viewportFrameId = window.requestAnimationFrame(() => {
      this.viewportFrameId = null;
      this.publishViewport();
    });
  }

  private computeEditorMoveSnap(
    moveX: number,
    moveY: number
  ): CanvasMoveSnapResult | null {
    const selected = this.readSelectedSnapBoxes();

    if (selected.length === 0) {
      this.clearSnapIndicators();
      return null;
    }

    const selectedIds = new Set(selected.map((box) => box.id));
    const viewportBounds = this.readViewportSnapBounds();
    const candidates = viewportBounds
      ? this.readSnapCandidateBoxes(selectedIds, viewportBounds)
      : [];

    if (candidates.length === 0) {
      this.clearSnapIndicators();
      return null;
    }

    const zoom = Math.max(MIN_ZOOM, this.currentViewport().zoom);

    return computeCanvasMoveSnap({
      candidates,
      move: { x: moveX, y: moveY },
      selected,
      threshold: DEFAULT_CANVAS_SNAP_THRESHOLD / zoom
    });
  }

  private computeEditorScaleSnap(
    data: IEditorScaleData
  ): CanvasScaleSnapResult | null {
    const origin = scaleOriginPoint(data.origin);

    if (!origin) {
      this.clearSnapIndicators();
      return null;
    }

    const selected = this.readSelectedSnapBoxes();

    if (selected.length === 0) {
      this.clearSnapIndicators();
      return null;
    }

    const selectedIds = new Set(selected.map((box) => box.id));
    const viewportBounds = this.readViewportSnapBounds();
    const candidates = viewportBounds
      ? this.readSnapCandidateBoxes(selectedIds, viewportBounds)
      : [];
    const preserveAspectRatio =
      Boolean(data.lockRatio) ||
      selected.some((box) => box.preserveAspectRatio);
    const zoom = Math.max(MIN_ZOOM, this.currentViewport().zoom);

    if (candidates.length === 0) {
      this.clearSnapIndicators();
      return null;
    }

    return computeCanvasScaleSnap({
      candidates,
      origin,
      preserveAspectRatio,
      scaleX: data.scaleX,
      scaleY: data.scaleY,
      selected,
      threshold: DEFAULT_CANVAS_SNAP_THRESHOLD / zoom
    });
  }

  private constrainScaleToMinimumNodeSize(
    data: IEditorScaleData,
    scaleX: number,
    scaleY: number
  ): { scaleX: number; scaleY: number } {
    const editorElements = this.app.editor.list;

    if (editorElements.length <= 1) {
      return { scaleX, scaleY };
    }

    let minimumScaleX = 0;
    let minimumScaleY = 0;
    let preserveAspectRatio = Boolean(data.lockRatio);

    for (const element of editorElements) {
      preserveAspectRatio ||= Boolean(element.lockRatio);
      const nodeId = elementNodeIds.get(element);
      const minimumSize = nodeId
        ? this.elementMinimumSizes.get(nodeId)
        : undefined;
      const width = element.width ?? 0;
      const height = element.height ?? 0;

      if (!(minimumSize && width > 0 && height > 0)) {
        continue;
      }

      minimumScaleX = Math.max(minimumScaleX, minimumSize.width / width);
      minimumScaleY = Math.max(minimumScaleY, minimumSize.height / height);
    }

    if (minimumScaleX <= 0 && minimumScaleY <= 0) {
      return { scaleX, scaleY };
    }

    if (preserveAspectRatio) {
      const minimumScale = Math.max(minimumScaleX, minimumScaleY);
      return {
        scaleX: scaleX > 0 ? Math.max(scaleX, minimumScale) : scaleX,
        scaleY: scaleY > 0 ? Math.max(scaleY, minimumScale) : scaleY
      };
    }

    return {
      scaleX: scaleX > 0 ? Math.max(scaleX, minimumScaleX) : scaleX,
      scaleY: scaleY > 0 ? Math.max(scaleY, minimumScaleY) : scaleY
    };
  }

  private readSelectedSnapBoxes(): CanvasSnapBox[] {
    const boxes: CanvasSnapBox[] = [];
    const seen = new Set<string>();

    for (const element of this.app.editor.list) {
      const box = this.readSceneElementSnapBox(element);

      if (!(box && !seen.has(box.id))) {
        continue;
      }

      seen.add(box.id);
      boxes.push(box);
    }

    return boxes;
  }

  private readSnapCandidateBoxes(
    selectedIds: ReadonlySet<string>,
    viewportBounds: CanvasSnapBounds
  ): CanvasSnapBox[] {
    const boxes: CanvasSnapBox[] = [];

    for (const [nodeId, rendered] of this.elements) {
      const box = readElementSnapBox(
        nodeSnapBoxId(nodeId),
        rendered.root,
        this.tree
      );

      if (box && !selectedIds.has(box.id)) {
        boxes.push(box);
      }
    }

    for (const [groupId, groupElement] of this.groups) {
      const box = readElementSnapBox(
        groupSnapBoxId(groupId),
        groupElement,
        this.tree
      );

      if (box && !selectedIds.has(box.id)) {
        boxes.push(box);
      }
    }

    return filterCanvasSnapBoxesByBounds(boxes, viewportBounds);
  }

  private readViewportSnapBounds(): CanvasSnapBounds | null {
    const bounds = this.view.getBoundingClientRect();
    const viewport = this.currentViewport();
    const zoom = Math.max(MIN_ZOOM, viewport.zoom);
    const width = bounds.width / zoom;
    const height = bounds.height / zoom;
    const x = -viewport.x / zoom;
    const y = -viewport.y / zoom;

    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { height, width, x, y };
    }

    return null;
  }

  private readSceneElementSnapBox(element: IUI): CanvasSnapBox | null {
    const groupId = elementGroupIds.get(element);

    if (groupId) {
      return readElementSnapBox(groupSnapBoxId(groupId), element, this.tree);
    }

    const nodeId = elementNodeIds.get(element);

    if (nodeId) {
      return readElementSnapBox(nodeSnapBoxId(nodeId), element, this.tree);
    }

    return null;
  }

  private renderSnapIndicators(result: { lines: readonly CanvasSnapLine[] }) {
    this.snapIndicatorLayer.removeAll(true);

    if (result.lines.length === 0) {
      this.snapIndicatorLayer.set({ visible: false });
      return;
    }

    const thickness = 1 / Math.max(MIN_ZOOM, this.currentViewport().zoom);
    const fill = readCssColorVariable(this.view, ASSET_ACTION_COLOR_VARIABLE);

    for (const line of result.lines) {
      const length = Math.max(thickness, line.end - line.start);
      const indicator =
        line.axis === "x"
          ? new Rect({
              fill,
              height: length,
              hitSelf: false,
              width: thickness,
              x: line.value - thickness / 2,
              y: line.start
            } as never)
          : new Rect({
              fill,
              height: thickness,
              hitSelf: false,
              width: length,
              x: line.start,
              y: line.value - thickness / 2
            } as never);

      this.snapIndicatorLayer.add(indicator);
    }

    this.snapIndicatorLayer.set({
      visible: true,
      zIndex: SNAP_INDICATOR_Z_INDEX
    } as never);
  }

  private clearSnapIndicators(): void {
    this.snapIndicatorLayer.removeAll(true);
    this.snapIndicatorLayer.set({ visible: false });
  }

  private syncNodeMinimumSize(
    nodeId: string,
    minimumSize: CanvasNodeMinimumSize | null
  ): void {
    if (minimumSize) {
      this.elementMinimumSizes.set(nodeId, minimumSize);
    } else {
      this.elementMinimumSizes.delete(nodeId);
    }
  }

  private attachElementToParent(element: IUI, groupId: string | undefined) {
    const parent = groupId ? (this.groups.get(groupId) ?? this.tree) : this.tree;

    if (element.parent === parent) {
      return;
    }

    parent.add(element);
  }

  private readGroupChildNodeLayouts(
    groupElement: unknown
  ): CanvasNodeLayoutChange[] {
    const childLayouts: CanvasNodeLayoutChange[] = [];

    for (const [nodeId, rendered] of this.elements) {
      if (rendered.root.parent === groupElement) {
        childLayouts.push({ layout: readNodeLayout(rendered.root), nodeId });
      }
    }

    return childLayouts;
  }
}

function renderNodeContent(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  options: {
    onTextDocumentObstacleLayout?: TextDocumentObstacleLayoutHandler | null;
    onTextDocumentObstacleTransformEnd?: (() => void) | null;
    onTextDocumentObstacleTransformStart?: (() => void) | null;
    theme: CanvasRuntimeTheme;
  }
): IUI | null {
  if (isJsonCanvasGroupAsset(asset)) {
    return renderJsonCanvasGroupElement(root, node, asset, options.theme);
  }

  if (isJsonCanvasTextAsset(asset)) {
    return renderJsonCanvasTextElement(root, node, asset, options.theme);
  }

  if (isTextDocumentAsset(asset)) {
    renderTextDocumentElement(root, node, asset, options);
    return null;
  }

  const previewUrl = previewUrlForAsset(asset);

  if (previewUrl && isPreviewBackedAsset(asset)) {
    const previewElement = renderPreviewElement(root, node, asset, previewUrl);
    renderJsonCanvasNodeOutline(root, node, asset, options.theme);
    return previewElement;
  }

  const fileElement = renderFileElement(root, node, asset, options.theme);
  return fileElement;
}

function renderJsonCanvasGroupElement(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): IUI {
  const colorStyle = jsonCanvasColorStyle(
    asset.jsonCanvasColor,
    theme,
    "rgba(245,245,245,0.42)"
  );
  const fill = jsonCanvasGroupFill(asset, colorStyle);
  const background = new Rect({
    cornerRadius: 12,
    fill,
    height: node.height,
    hitBox: true,
    stroke: colorStyle.stroke,
    strokeWidth: 2,
    width: node.width
  } as never);

  root.add(background);

  const label = asset.jsonCanvasLabel || asset.name;
  if (label) {
    const labelBackgroundWidth = Math.max(
      1,
      Math.min(Math.max(1, node.width - 24), Math.max(80, label.length * 7 + 28))
    );
    root.add(
      new Rect({
        cornerRadius: 8,
        fill: "rgba(255,255,255,0.82)",
        height: 28,
        stroke: colorStyle.stroke,
        strokeWidth: 1,
        width: Math.max(1, labelBackgroundWidth),
        x: 12,
        y: 12
      } as never)
    );
    root.add(
      new Text({
        fill: colorStyle.text,
        fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
        fontSize: FILE_CARD_TITLE_TYPE.fontSize,
        fontWeight: "700",
        height: FILE_CARD_TITLE_TYPE.lineHeight,
        lineHeight: FILE_CARD_TITLE_TYPE.lineHeight,
        text: label,
        textOverflow: "ellipsis",
        width: Math.max(1, labelBackgroundWidth - 16),
        x: 20,
        y: 15
      } as never)
    );
  }

  return background;
}

function renderJsonCanvasTextElement(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): IUI {
  const colorStyle = jsonCanvasColorStyle(asset.jsonCanvasColor, theme, theme.surface);
  const background = new Rect({
    cornerRadius: CARD_RADIUS,
    fill: colorStyle.fill,
    height: node.height,
    hitBox: true,
    stroke: colorStyle.stroke,
    strokeWidth: 2,
    width: node.width
  } as never);
  const lines = jsonCanvasTextDisplayLines(asset);
  const compact = node.height <
    JSON_CANVAS_TEXT_PADDING * 2 + JSON_CANVAS_TEXT_TITLE_LINE_HEIGHT;
  const textPaddingX = compact
    ? Math.min(JSON_CANVAS_TEXT_PADDING, Math.max(12, node.width * 0.08))
    : JSON_CANVAS_TEXT_PADDING;
  const textWidth = Math.max(1, node.width - textPaddingX * 2);
  const textHeight = Math.max(1, node.height - JSON_CANVAS_TEXT_PADDING * 2);
  const maxLines = Math.max(
    1,
    Math.floor(textHeight / JSON_CANVAS_TEXT_BODY_LINE_HEIGHT)
  );

  root.add(background);

  if (compact) {
    const lineHeight = Math.max(
      14,
      Math.min(JSON_CANVAS_TEXT_TITLE_LINE_HEIGHT, node.height - 10)
    );
    root.add(
      new Text({
        fill: colorStyle.text,
        fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
        fontSize: Math.max(12, Math.min(JSON_CANVAS_TEXT_TITLE_FONT_SIZE, lineHeight - 4)),
        fontWeight: "700",
        height: lineHeight,
        lineHeight,
        text: lines[0] ?? asset.name,
        textOverflow: "ellipsis",
        width: textWidth,
        x: textPaddingX,
        y: Math.max(2, (node.height - lineHeight) / 2)
      } as never)
    );
    return background;
  }

  lines.slice(0, maxLines).forEach((line, index) => {
    const isTitle = index === 0;
    const lineHeight = isTitle
      ? JSON_CANVAS_TEXT_TITLE_LINE_HEIGHT
      : JSON_CANVAS_TEXT_BODY_LINE_HEIGHT;
    const fontSize = isTitle
      ? JSON_CANVAS_TEXT_TITLE_FONT_SIZE
      : JSON_CANVAS_TEXT_BODY_FONT_SIZE;
    const y =
      JSON_CANVAS_TEXT_PADDING +
      (isTitle ? 0 : JSON_CANVAS_TEXT_TITLE_LINE_HEIGHT) +
      Math.max(0, index - 1) * JSON_CANVAS_TEXT_BODY_LINE_HEIGHT;

    if (y + lineHeight > node.height - JSON_CANVAS_TEXT_PADDING / 2) {
      return;
    }

    root.add(
      new Text({
        fill: colorStyle.text,
        fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
        fontSize,
        fontWeight: isTitle ? "700" : "500",
        height: lineHeight,
        lineHeight,
        text: line,
        textOverflow: "ellipsis",
        width: textWidth,
        x: textPaddingX,
        y
      } as never)
    );
  });

  return background;
}

function renderPreviewElement(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  url: string
): IUI {
  const previewElement = new Rect({
    fill: createImageFill(url, false),
    height: node.height,
    hitBox: true,
    lockRatio: true,
    placeholderColor: "rgba(120,120,120,0.2)",
    width: node.width
  } as never);

  root.add(previewElement);

  const label = asset.kind === "image" ? null : assetKindLabel(asset);

  if (label) {
    renderBadge(root, label, 12, 12, "#00000099", "#ffffff");
  }

  return previewElement;
}

function renderJsonCanvasNodeOutline(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): void {
  if (!asset.jsonCanvasColor) {
    return;
  }

  const colorStyle = jsonCanvasColorStyle(
    asset.jsonCanvasColor,
    theme,
    theme.surface
  );
  root.add(
    new Rect({
      cornerRadius: CARD_RADIUS,
      fill: "transparent",
      height: node.height,
      hitSelf: false,
      stroke: colorStyle.stroke,
      strokeWidth: 2,
      width: node.width
    } as never)
  );
}

function renderFileElement(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): IUI {
  const colorStyle = jsonCanvasColorStyle(asset.jsonCanvasColor, theme);
  const background = new Rect({
    cornerRadius: CARD_RADIUS,
    fill: colorStyle.fill,
    height: node.height,
    stroke: colorStyle.stroke,
    strokeWidth: 1,
    width: node.width
  } as never);

  root.add(background);

  renderKindMark(root, asset, theme);
  root.add(
    new Text({
      fill: colorStyle.text,
      fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
      fontSize: FILE_CARD_TITLE_TYPE.fontSize,
      fontWeight: "600",
      height: FILE_CARD_TITLE_TYPE.lineHeight,
      lineHeight: FILE_CARD_TITLE_TYPE.lineHeight,
      text: asset.name,
      textOverflow: "ellipsis",
      width: Math.max(1, node.width - 32),
      x: 16,
      y: 18
    } as never)
  );
  root.add(
    new Text({
      fill: colorStyle.mutedText,
      fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
      fontSize: FILE_CARD_META_TYPE.fontSize,
      fontWeight: String(FILE_CARD_META_TYPE.fontWeight),
      height: FILE_CARD_META_TYPE.lineHeight,
      lineHeight: FILE_CARD_META_TYPE.lineHeight,
      text: asset.mime,
      textOverflow: "ellipsis",
      width: Math.max(1, node.width - 32),
      x: 16,
      y: 48
    } as never)
  );

  return background;
}

function renderTextDocumentElement(
  root: Group,
  _node: CanvasNode,
  _asset: CanvasAsset,
  options: {
    onTextDocumentObstacleLayout?: TextDocumentObstacleLayoutHandler | null;
    onTextDocumentObstacleTransformEnd?: (() => void) | null;
    onTextDocumentObstacleTransformStart?: (() => void) | null;
    theme: CanvasRuntimeTheme;
  }
): void {
  const { theme } = options;

  root.set({
    editConfig: {
      lockRatio: false
    },
    editInner: TEXT_DOCUMENT_SCROLL_EDITOR_TAG
  } as never);

  const background = new Rect({
    cornerRadius: CARD_RADIUS,
    fill: theme.surface,
    stroke: theme.border,
    strokeWidth: 1
  } as never);
  const title = new Text({
    fill: theme.foreground,
    fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
    fontSize: TEXT_DOCUMENT_TITLE_TYPE.fontSize,
    fontWeight: "700",
    height: TEXT_DOCUMENT_TITLE_TYPE.lineHeight,
    lineHeight: TEXT_DOCUMENT_TITLE_TYPE.lineHeight,
    text: "",
    textOverflow: "ellipsis",
    x: TEXT_DOCUMENT_PADDING,
    y: 16
  } as never);
  const meta = new Text({
    fill: theme.mutedForeground,
    fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
    fontSize: TEXT_DOCUMENT_META_TYPE.fontSize,
    fontWeight: String(TEXT_DOCUMENT_META_TYPE.fontWeight),
    height: TEXT_DOCUMENT_META_TYPE.lineHeight,
    lineHeight: TEXT_DOCUMENT_META_TYPE.lineHeight,
    text: "",
    textOverflow: "ellipsis",
    x: TEXT_DOCUMENT_PADDING,
    y: 43
  } as never);
  const divider = new Rect({
    fill: theme.border,
    height: 1,
    x: 0,
    y: TEXT_DOCUMENT_HEADER_HEIGHT
  } as never);
  const body = new Box({
    fill: "transparent",
    hitChildren: true,
    hitSelf: true,
    overflow: "hide",
    scrollConfig: { stopDefault: true },
    x: 0,
    y: TEXT_DOCUMENT_HEADER_HEIGHT
  } as never);
  const obstacle = new Box({
    cornerRadius: 8,
    cursor: "grab",
    fill: theme.accent,
    hitChildren: false,
    hitSelf: true,
    stroke: theme.border,
    strokeWidth: 1,
    visible: false
  } as never);

  root.add(background);
  root.add(title);
  root.add(meta);
  root.add(divider);
  root.add(body);
  body.add(obstacle);

  const state: TextDocumentElementState = {
    background,
    body,
    callbacks: {
      onObstacleLayout:
        options.onTextDocumentObstacleLayout ?? (() => undefined),
      onObstacleTransformEnd:
        options.onTextDocumentObstacleTransformEnd ?? (() => undefined),
      onObstacleTransformStart:
        options.onTextDocumentObstacleTransformStart ?? (() => undefined)
    },
    divider,
    layoutHash: "",
    lineTexts: [],
    meta,
    obstacle,
    obstacleDragStart: null,
    scrollModeActive: false,
    title
  };
  textDocumentStates.set(root, state);
  attachTextDocumentObstacleDragHandlers(root, state);
}

function attachTextDocumentObstacleDragHandlers(
  root: Group,
  state: TextDocumentElementState
): void {
  const { body, callbacks, obstacle } = state;

  obstacle.on(DragEvent.START, () => {
    const nodeId = readNodeId(root);
    if (!nodeId) {
      return;
    }

    state.obstacleDragStart = {
      obstacle: {
        height: obstacle.height ?? 0,
        width: obstacle.width ?? 0,
        x: obstacle.x ?? 0,
        y: (obstacle.y ?? 0) + TEXT_DOCUMENT_HEADER_HEIGHT
      },
      scrollY: body.scrollY ?? 0
    };
    callbacks.onObstacleTransformStart();
  });

  obstacle.on(DragEvent.DRAG, (event: DragEvent) => {
    const start = state.obstacleDragStart;
    const nodeId = readNodeId(root);
    if (!(start && nodeId)) {
      return;
    }

    event.stopDefault?.();

    const delta = event.getInnerMove(root, true);
    const scrollDelta = (body.scrollY ?? 0) - start.scrollY;
    const cardWidth = root.width ?? start.obstacle.width;
    const cardHeight = root.height ?? start.obstacle.height;
    const next = clampTextDocumentObstacle(
      {
        height: start.obstacle.height,
        width: start.obstacle.width,
        x: start.obstacle.x + delta.x,
        y: start.obstacle.y + delta.y + scrollDelta
      },
      cardWidth,
      cardHeight
    );

    obstacle.set({
      height: next.height,
      width: next.width,
      x: next.x,
      y: next.y - TEXT_DOCUMENT_HEADER_HEIGHT
    } as never);
    callbacks.onObstacleLayout(nodeId, next, true);
  });

  obstacle.on(DragEvent.END, () => {
    if (!state.obstacleDragStart) {
      return;
    }

    state.obstacleDragStart = null;
    callbacks.onObstacleTransformEnd();
  });
}

function applyTextDocumentLayout(
  root: Group,
  node: CanvasNode,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): void {
  const state = textDocumentStates.get(root);
  if (!state) {
    return;
  }

  const width = Math.max(1, node.width);
  const height = Math.max(1, node.height);
  const bodyTop = TEXT_DOCUMENT_HEADER_HEIGHT;
  const bodyHeight = Math.max(1, height - bodyTop - TEXT_DOCUMENT_PADDING);
  const innerWidth = Math.max(1, width - TEXT_DOCUMENT_PADDING * 2);
  const { body: bodyText, title } = textDocumentContent(asset);
  const colorStyle = jsonCanvasColorStyle(
    asset.jsonCanvasColor,
    theme,
    theme.surface
  );

  state.background.set({
    fill: colorStyle.fill,
    height,
    stroke: colorStyle.stroke,
    width
  } as never);
  state.title.set({ fill: colorStyle.text, text: title, width: innerWidth } as never);
  state.meta.set({
    fill: colorStyle.mutedText,
    text: documentMetaText(asset),
    width: innerWidth
  } as never);
  state.divider.set({ width } as never);
  state.body.set({ height: bodyHeight, width } as never);

  const obstacle = textDocumentObstacle(asset, width, height);
  if (obstacle) {
    state.obstacle.set({
      height: obstacle.height,
      visible: true,
      width: obstacle.width,
      x: obstacle.x,
      y: obstacle.y - bodyTop
    } as never);
  } else {
    state.obstacle.set({ visible: false } as never);
  }

  const layoutHash = textDocumentLayoutHash(width, obstacle, bodyText);
  if (state.layoutHash === layoutHash) {
    return;
  }
  state.layoutHash = layoutHash;

  syncTextDocumentBodyLines(
    state,
    layoutTextDocumentLines(bodyText, width, obstacle),
    bodyTop,
    theme
  );
}

function syncTextDocumentBodyLines(
  state: TextDocumentElementState,
  lines: readonly TextDocumentBodyLine[],
  bodyTop: number,
  theme: CanvasRuntimeTheme
): void {
  const pool = state.lineTexts;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

    let text = pool[index];
    if (!text) {
      text = new Text({
        fill: theme.foreground,
        fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
        fontSize: TEXT_DOCUMENT_BODY_TYPE.fontSize,
        fontWeight: String(TEXT_DOCUMENT_BODY_TYPE.fontWeight),
        height: TEXT_DOCUMENT_BODY_TYPE.lineHeight,
        hitSelf: false,
        lineHeight: TEXT_DOCUMENT_BODY_TYPE.lineHeight,
        text: "",
        textOverflow: "hide",
        textWrap: "none",
        x: 0,
        y: 0
      } as never);
      state.body.addAt(text, index);
      pool.push(text);
    }

    text.set({
      fill: theme.foreground,
      height: TEXT_DOCUMENT_BODY_TYPE.lineHeight,
      text: line.text,
      visible: true,
      width: line.slotWidth,
      x: line.x,
      y: line.y - bodyTop
    } as never);
  }

  for (let index = lines.length; index < pool.length; index += 1) {
    pool[index]?.set({ visible: false } as never);
  }
}

function renderKindMark(
  root: Group,
  asset: CanvasAsset,
  theme: CanvasRuntimeTheme
): void {
  const mark = assetKindLabel(asset);
  const fill =
    asset.kind === "file"
      ? theme.surface
      : asset.kind === "video"
        ? "#fee2e2"
        : asset.kind === "pdf"
          ? "#fef3c7"
          : asset.kind === "presentation"
            ? "#e0f2fe"
            : "#dcfce7";

  root.add(
    new Rect({
      cornerRadius: 6,
      fill,
      height: 28,
      stroke: theme.border,
      strokeWidth: 1,
      width: 44,
      x: 16,
      y: Math.max(72, 0)
    } as never)
  );
  root.add(
    new Text({
      fill: theme.foreground,
      fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
      fontSize: 11,
      fontWeight: "700",
      height: 14,
      text: mark,
      textAlign: "center",
      width: 44,
      x: 16,
      y: Math.max(79, 0)
    } as never)
  );
}

function renderBadge(
  root: Group,
  label: string,
  x: number,
  y: number,
  fill: string,
  textFill: string
): void {
  const width = Math.max(52, Math.min(180, label.length * 7 + 20));

  root.add(
    new Rect({
      cornerRadius: 12,
      fill,
      height: 24,
      width,
      x,
      y
    } as never)
  );
  root.add(
    new Text({
      fill: textFill,
      fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
      fontSize: 12,
      fontWeight: "700",
      height: 14,
      text: label,
      textAlign: "center",
      width,
      x,
      y: y + 5
    } as never)
  );
}

function renderJsonCanvasEdgeElement({
  edge,
  from,
  theme,
  to
}: {
  edge: CanvasEdge;
  from: CanvasAbsoluteNodeRect;
  theme: CanvasRuntimeTheme;
  to: CanvasAbsoluteNodeRect;
}): Group {
  const fromCenter = rectCenter(from);
  const toCenter = rectCenter(to);
  const fromSide = edge.fromSide ?? inferredEdgeSide(from, toCenter);
  const toSide = edge.toSide ?? inferredEdgeSide(to, fromCenter);
  const fromPoint = anchorPoint(from, fromSide);
  const toPoint = anchorPoint(to, toSide);
  const curve = jsonCanvasEdgeCurve(fromPoint, fromSide, toPoint, toSide);
  const stroke = jsonCanvasColorValue(edge.color) ?? theme.mutedForeground;
  const group = new Group({
    editable: false,
    hitChildren: false,
    hitSelf: false
  } as never);

  group.add(
    new Path({
      endArrow: edge.toEnd === "arrow" ? "arrow" : "none",
      path: jsonCanvasEdgePath(curve),
      startArrow: edge.fromEnd === "arrow" ? "arrow" : "none",
      stroke,
      strokeCap: "round",
      strokeJoin: "round",
      strokeWidth: JSON_CANVAS_EDGE_STROKE_WIDTH
    } as never)
  );

  const label = edge.label?.trim();
  if (label) {
    const midpoint = cubicBezierPoint(curve, 0.5);
    const width = Math.max(48, Math.min(180, label.length * 7 + 22));
    group.add(
      new Rect({
        cornerRadius: 8,
        fill: "rgba(255,255,255,0.88)",
        height: 24,
        stroke,
        strokeWidth: 1,
        width,
        x: midpoint.x - width / 2,
        y: midpoint.y - 12
      } as never)
    );
    group.add(
      new Text({
        fill: theme.foreground,
        fontFamily: TEXT_DOCUMENT_FONT_FAMILY,
        fontSize: 12,
        fontWeight: "600",
        height: 16,
        lineHeight: 16,
        text: label,
        textAlign: "center",
        textOverflow: "ellipsis",
        width: width - 12,
        x: midpoint.x - width / 2 + 6,
        y: midpoint.y - 8
      } as never)
    );
  }

  return group;
}

interface CanvasAbsoluteNodeRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface JsonCanvasEdgeCurve {
  controlFrom: CanvasPoint;
  controlTo: CanvasPoint;
  from: CanvasPoint;
  to: CanvasPoint;
}

function absoluteNodeRect(
  scene: CanvasScene,
  node: CanvasNode
): CanvasAbsoluteNodeRect {
  const group = node.groupId ? scene.groups[node.groupId] : null;
  return {
    height: node.height,
    width: node.width,
    x: (group?.x ?? 0) + node.x,
    y: (group?.y ?? 0) + node.y
  };
}

function rectCenter(rect: CanvasAbsoluteNodeRect): CanvasPoint {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function inferredEdgeSide(
  rect: CanvasAbsoluteNodeRect,
  target: CanvasPoint
): CanvasEdgeSide {
  const center = rectCenter(rect);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

function anchorPoint(
  rect: CanvasAbsoluteNodeRect,
  side: CanvasEdgeSide
): CanvasPoint {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    default: {
      const exhaustive: never = side;
      throw new Error(`unsupported JSON Canvas edge side: ${exhaustive}`);
    }
  }
}

function jsonCanvasEdgeCurve(
  from: CanvasPoint,
  fromSide: CanvasEdgeSide,
  to: CanvasPoint,
  toSide: CanvasEdgeSide
): JsonCanvasEdgeCurve {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const controlDistance = Math.max(48, Math.min(220, distance * 0.45));
  const fromDirection = edgeSideDirection(fromSide);
  const toDirection = edgeSideDirection(toSide);

  return {
    controlFrom: {
      x: from.x + fromDirection.x * controlDistance,
      y: from.y + fromDirection.y * controlDistance
    },
    controlTo: {
      x: to.x + toDirection.x * controlDistance,
      y: to.y + toDirection.y * controlDistance
    },
    from,
    to
  };
}

function jsonCanvasEdgePath(curve: JsonCanvasEdgeCurve): string {
  return [
    `M ${formatPathNumber(curve.from.x)} ${formatPathNumber(curve.from.y)}`,
    `C ${formatPathNumber(curve.controlFrom.x)} ${formatPathNumber(
      curve.controlFrom.y
    )} ${formatPathNumber(curve.controlTo.x)} ${formatPathNumber(
      curve.controlTo.y
    )} ${formatPathNumber(curve.to.x)} ${formatPathNumber(curve.to.y)}`
  ].join(" ");
}

function cubicBezierPoint(
  curve: JsonCanvasEdgeCurve,
  t: number
): CanvasPoint {
  const remaining = 1 - t;
  const remainingSquared = remaining * remaining;
  const tSquared = t * t;
  return {
    x:
      remainingSquared * remaining * curve.from.x +
      3 * remainingSquared * t * curve.controlFrom.x +
      3 * remaining * tSquared * curve.controlTo.x +
      tSquared * t * curve.to.x,
    y:
      remainingSquared * remaining * curve.from.y +
      3 * remainingSquared * t * curve.controlFrom.y +
      3 * remaining * tSquared * curve.controlTo.y +
      tSquared * t * curve.to.y
  };
}

function edgeSideDirection(side: CanvasEdgeSide): CanvasPoint {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    default: {
      const exhaustive: never = side;
      throw new Error(`unsupported JSON Canvas edge side: ${exhaustive}`);
    }
  }
}

function formatPathNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function isJsonCanvasGroupAsset(asset: CanvasAsset): boolean {
  return asset.jsonCanvasNodeType === "group";
}

function isJsonCanvasTextAsset(asset: CanvasAsset): boolean {
  return asset.jsonCanvasNodeType === "text";
}

function jsonCanvasTextDisplayLines(asset: CanvasAsset): string[] {
  const text = (asset.acceptedTextSnapshot ?? asset.textContent ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").trimEnd())
    .filter((line) => line.trim().length > 0);

  return lines.length > 0 ? lines : [asset.name || "Text"];
}

function jsonCanvasGroupFill(
  asset: CanvasAsset,
  colorStyle: JsonCanvasColorStyle
) {
  if (asset.url && asset.jsonCanvasBackground) {
    return {
      ...createImageFill(asset.url, false),
      mode: jsonCanvasBackgroundFillMode(asset.jsonCanvasBackgroundStyle)
    };
  }

  return colorStyle.fill;
}

function jsonCanvasBackgroundFillMode(
  style: CanvasAsset["jsonCanvasBackgroundStyle"]
): "cover" | "fit" | "repeat" | "stretch" {
  switch (style) {
    case "cover":
      return "cover";
    case "ratio":
      return "fit";
    case "repeat":
      return "repeat";
    default:
      return "stretch";
  }
}

function jsonCanvasEdgeLayerZIndex(scene: CanvasScene): number {
  const groupZs: number[] = [];
  const contentZs: number[] = [];

  for (const node of scene.nodes) {
    const asset = scene.assets[node.assetId];
    if (asset && isJsonCanvasGroupAsset(asset)) {
      groupZs.push(node.z);
    } else {
      contentZs.push(node.z);
    }
  }

  const maxGroupZ = groupZs.length > 0 ? Math.max(...groupZs) : null;
  const minContentZ = contentZs.length > 0 ? Math.min(...contentZs) : null;

  if (maxGroupZ !== null && minContentZ !== null && maxGroupZ < minContentZ) {
    return (maxGroupZ + minContentZ) / 2;
  }
  if (minContentZ !== null) {
    return minContentZ - 0.5;
  }
  if (maxGroupZ !== null) {
    return maxGroupZ + 0.5;
  }
  return JSON_CANVAS_EDGE_LAYER_Z_INDEX;
}

function jsonCanvasColorStyle(
  color: string | undefined,
  theme: CanvasRuntimeTheme,
  fallbackFill = theme.muted
): JsonCanvasColorStyle {
  const normalized = jsonCanvasColorValue(color);
  if (!normalized) {
    return {
      fill: fallbackFill,
      mutedText: theme.mutedForeground,
      stroke: theme.border,
      text: theme.foreground
    };
  }

  return {
    fill: hexToRgba(normalized, 0.12),
    mutedText: theme.mutedForeground,
    stroke: normalized,
    text: theme.foreground
  };
}

const JSON_CANVAS_PRESET_COLORS: Record<string, string> = {
  "1": "#ef4444",
  "2": "#f97316",
  "3": "#eab308",
  "4": "#22c55e",
  "5": "#06b6d4",
  "6": "#8b5cf6"
};

function jsonCanvasColorValue(color: string | undefined): string | null {
  if (!color) {
    return null;
  }

  const preset = JSON_CANVAS_PRESET_COLORS[color];
  if (preset) {
    return preset;
  }

  const trimmed = color.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${[...trimmed.slice(1)]
      .map((character) => `${character}${character}`)
      .join("")}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = jsonCanvasColorValue(hex);
  if (!normalized) {
    return hex;
  }

  const value = normalized.slice(1);
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function nodeRenderKey(node: CanvasNode, asset: CanvasAsset): string {
  if (isTextDocumentAsset(asset) && !isJsonCanvasTextAsset(asset)) {
    return ["text-document", asset.id, asset.kind, asset.mime, asset.name].join(
      "|"
    );
  }

  return [
    node.width,
    node.height,
    asset.kind,
    asset.mime,
    asset.name,
    asset.jsonCanvasBackground ?? "",
    asset.jsonCanvasBackgroundStyle ?? "",
    asset.jsonCanvasColor ?? "",
    asset.jsonCanvasFile ?? "",
    asset.jsonCanvasLabel ?? "",
    asset.jsonCanvasNodeType ?? "",
    asset.jsonCanvasSubpath ?? "",
    asset.jsonCanvasUrl ?? "",
    asset.acceptedTextSnapshot ?? "",
    asset.textContent ?? "",
    asset.url ?? "",
    asset.snapshotUrl ?? "",
    asset.thumbnailUrl ?? "",
    asset.sourceAssetId ?? "",
    asset.textObstacle
      ? `${asset.textObstacle.x},${asset.textObstacle.y},${asset.textObstacle.width},${asset.textObstacle.height}`
      : ""
  ].join("|");
}

function assetKindLabel(asset: CanvasAsset): string {
  if (asset.kind === "presentation") {
    return "PPT";
  }

  return asset.kind.toUpperCase();
}

export function getElementNodeId(element: IUI): string | null {
  return elementNodeIds.get(element) ?? readNodeId(element);
}

function readNodeId(target: unknown): string | null {
  if (
    typeof target === "object" &&
    target &&
    "id" in target &&
    typeof target.id === "string"
  ) {
    return target.id;
  }

  return null;
}

function readGroupId(target: unknown): string | null {
  return typeof target === "object" && target
    ? (elementGroupIds.get(target as IUI) ?? null)
    : null;
}

function createThemeObserver(
  view: HTMLElement,
  onThemeChange: () => void
): MutationObserver | null {
  const { defaultView, documentElement } = view.ownerDocument;

  if (!defaultView?.MutationObserver) {
    return null;
  }

  const observer = new defaultView.MutationObserver(onThemeChange);
  observer.observe(documentElement, {
    attributeFilter: ["class", "style"],
    attributes: true
  });
  return observer;
}

function readCanvasRuntimeTheme(view: HTMLElement): CanvasRuntimeTheme {
  return {
    accent: readCssColorVariable(view, "--accent", colorTokens.accent),
    assetAction: readCssColorVariable(
      view,
      ASSET_ACTION_COLOR_VARIABLE,
      colorTokens.primary
    ),
    border: readCssColorVariable(view, "--border", colorTokens.border),
    foreground: readCssColorVariable(
      view,
      "--foreground",
      colorTokens.foreground
    ),
    muted: readCssColorVariable(view, "--muted", colorTokens.muted),
    mutedForeground: readCssColorVariable(
      view,
      "--muted-foreground",
      colorTokens.mutedForeground
    ),
    surface: readCssColorVariable(view, "--surface", colorTokens.surface)
  };
}

function readCssColorVariable(
  view: HTMLElement,
  variableName: string,
  fallback = ASSET_ACTION_COLOR_FALLBACK
): string {
  const { defaultView, documentElement } = view.ownerDocument;

  if (!defaultView) {
    return fallback;
  }

  const inheritedValue = defaultView
    .getComputedStyle(view)
    .getPropertyValue(variableName)
    .trim();

  if (inheritedValue) {
    return inheritedValue;
  }

  return (
    defaultView
      .getComputedStyle(documentElement)
      .getPropertyValue(variableName)
      .trim() || fallback
  );
}



function createSnapIndicatorLayer(): Group {
  return new Group({
    editable: false,
    hitChildren: false,
    hitSelf: false,
    visible: false,
    zIndex: SNAP_INDICATOR_Z_INDEX
  } as never);
}

function createJsonCanvasEdgeLayer(): Group {
  return new Group({
    editable: false,
    hitChildren: false,
    hitSelf: false,
    visible: false,
    zIndex: JSON_CANVAS_EDGE_LAYER_Z_INDEX
  } as never);
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.0001;
}
