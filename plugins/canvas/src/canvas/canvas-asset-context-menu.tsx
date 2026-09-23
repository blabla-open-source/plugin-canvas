import { Fragment } from "react";
import {
  CANVAS_ASSET_LAYER_MENU_ITEMS,
  type CanvasAssetContextMenuAction,
  type CanvasAssetContextMenuActionEntry,
  type CanvasAssetContextMenuModel,
  canvasAssetContextMenuEntryKey,
  groupCanvasAssetContextMenuEntries
} from "./canvas-asset-context-menu-model";
import { canvasAssetContextMenuLabel } from "./canvas-asset-context-menu-labels";
import type { CanvasSceneReorderOperation } from "./canvas-scene-reorder";

interface CanvasAssetContextMenuViewProps {
  menu: { x: number; y: number } | null;
  model: CanvasAssetContextMenuModel | null;
  onActionSelect: (action: CanvasAssetContextMenuAction) => void;
  onLayerSelect: (operation: CanvasSceneReorderOperation) => void;
}

export function CanvasAssetContextMenu({
  menu,
  model,
  onActionSelect,
  onLayerSelect
}: CanvasAssetContextMenuViewProps) {
  if (!(menu && model)) {
    return null;
  }

  return (
    <div
      className="canvas-context-menu"
      data-testid="canvas-asset-context-menu"
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: menu.x, top: menu.y }}
    >
      {groupCanvasAssetContextMenuEntries(model.entries).map(
        (group, index, groups) => (
          <Fragment key={group.map(canvasAssetContextMenuEntryKey).join(":")}>
            <div className="canvas-context-menu-group">
              {group.map((entry) =>
                entry.type === "layer-submenu" ? (
                  <CanvasAssetLayerSubmenu
                    key={entry.id}
                    onSelect={onLayerSelect}
                  />
                ) : (
                  <CanvasAssetContextMenuButton
                    entry={entry}
                    key={entry.action}
                    onSelect={() => onActionSelect(entry.action)}
                  />
                )
              )}
            </div>
            {index < groups.length - 1 ? (
              <div className="canvas-context-menu-separator" />
            ) : null}
          </Fragment>
        )
      )}
    </div>
  );
}

function CanvasAssetContextMenuButton({
  entry,
  onSelect
}: {
  entry: CanvasAssetContextMenuActionEntry;
  onSelect: () => void;
}) {
  return (
    <button
      className={`canvas-context-menu-item ${
        entry.variant === "destructive"
          ? "canvas-context-menu-item-destructive"
          : ""
      }`}
      onClick={onSelect}
      type="button"
    >
      {canvasAssetContextMenuLabel(entry.action, entry.labelKey)}
    </button>
  );
}

function CanvasAssetLayerSubmenu({
  onSelect
}: {
  onSelect: (operation: CanvasSceneReorderOperation) => void;
}) {
  return (
    <div className="canvas-context-menu-layer-group">
      <div className="canvas-context-menu-label">Layer</div>
      {CANVAS_ASSET_LAYER_MENU_ITEMS.map((item) => (
        <CanvasAssetContextMenuButton
          entry={{ action: item.action, type: "action" }}
          key={item.action}
          onSelect={() => onSelect(item.operation)}
        />
      ))}
    </div>
  );
}
