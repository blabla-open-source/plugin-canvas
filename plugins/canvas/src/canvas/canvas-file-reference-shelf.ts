import type { CanvasFileReferenceShelfState } from "./types";

export const DEFAULT_FILE_REFERENCE_SHELF: CanvasFileReferenceShelfState = {
  collapsed: false,
  selectedFileIds: [],
  width: 300
};

export function defaultCanvasFileReferenceShelfState(): CanvasFileReferenceShelfState {
  return { ...DEFAULT_FILE_REFERENCE_SHELF };
}

export function normalizeCanvasFileReferenceShelfState(
  state: Partial<CanvasFileReferenceShelfState> | null | undefined
): CanvasFileReferenceShelfState {
  const selectedFileIds = Array.isArray(state?.selectedFileIds)
    ? state.selectedFileIds
    : DEFAULT_FILE_REFERENCE_SHELF.selectedFileIds;
  const width = state?.width;

  return {
    collapsed: Boolean(state?.collapsed),
    selectedFileIds: Array.from(
      new Set(
        selectedFileIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0
        )
      )
    ),
    width: typeof width === "number" && Number.isFinite(width)
      ? Math.max(220, Math.min(520, Math.round(width)))
      : DEFAULT_FILE_REFERENCE_SHELF.width
  };
}
