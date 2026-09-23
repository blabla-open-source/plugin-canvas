import {
  boundsForRects,
  type CanvasCollageRect
} from "./canvas-collage-geometry";

export interface CanvasCollagePackItem<T> {
  bounds: CanvasCollageRect;
  item: T;
  source: CanvasCollageRect;
}

export interface CanvasCollagePackedPlacement<T> {
  contentFrame: CanvasCollageRect;
  frame: CanvasCollageRect;
  item: T;
}

export interface CanvasCollagePackedLayout<T> {
  placements: readonly CanvasCollagePackedPlacement<T>[];
  scale: number;
}

const FOLDED_GAP_RATIO = 0.22;
const PACKED_CANVAS_MARGIN_SCALE = 0.96;

interface PackedCollageItem<T> {
  frame: CanvasCollageRect;
  item: CanvasCollagePackItem<T>;
}

interface PackedCollageLayout<T> {
  bounds: CanvasCollageRect;
  items: readonly PackedCollageItem<T>[];
}

interface FoldedAxisInterval {
  end: number;
  index: number;
  start: number;
}

interface FoldedAxisCluster {
  end: number;
  foldedStart: number;
  indices: number[];
  start: number;
}

export function packCanvasCollageItems<T>(
  items: readonly CanvasCollagePackItem<T>[],
  contentFrame: CanvasCollageRect
): CanvasCollagePackedLayout<T> {
  const packedLayout = packCanvasCollage(items);
  const scale = packedLayoutScale(packedLayout.bounds, contentFrame);
  return {
    placements: placePackedItems(packedLayout, contentFrame, scale),
    scale
  };
}

function packCanvasCollage<T>(
  items: readonly CanvasCollagePackItem<T>[]
): PackedCollageLayout<T> {
  const xPositions = foldedAxisPositions(
    items.map((item, index) => ({
      end: item.bounds.x + item.bounds.width,
      index,
      start: item.bounds.x
    }))
  );
  const yPositions = foldedAxisPositions(
    items.map((item, index) => ({
      end: item.bounds.y + item.bounds.height,
      index,
      start: item.bounds.y
    }))
  );
  const packedItems = items.map((item, index) => ({
    frame: {
      height: item.bounds.height,
      width: item.bounds.width,
      x: xPositions[index] ?? 0,
      y: yPositions[index] ?? 0
    },
    item
  }));
  const bounds = boundsForRects(packedItems.map((item) => item.frame));

  return {
    bounds,
    items: packedItems
  };
}

function foldedAxisPositions(
  intervals: readonly FoldedAxisInterval[]
): number[] {
  if (intervals.length === 0) {
    return [];
  }

  const gap = foldedAxisGap(intervals);
  const clusters = foldedAxisClusters(intervals, gap);
  const positions: number[] = [];

  for (const cluster of clusters) {
    for (const index of cluster.indices) {
      const interval = intervals[index];
      if (!interval) {
        continue;
      }
      positions[index] = cluster.foldedStart + interval.start - cluster.start;
    }
  }

  return positions;
}

function foldedAxisClusters(
  intervals: readonly FoldedAxisInterval[],
  foldedGap: number
): FoldedAxisCluster[] {
  const sorted = [...intervals].sort(
    (left, right) => left.start - right.start || left.end - right.end
  );
  const clusters: FoldedAxisCluster[] = [];

  for (const interval of sorted) {
    const current = clusters.at(-1);
    if (!current || interval.start > current.end) {
      const foldedStart = current
        ? current.foldedStart +
          (current.end - current.start) +
          Math.min(interval.start - current.end, foldedGap)
        : 0;
      clusters.push({
        end: interval.end,
        foldedStart,
        indices: [interval.index],
        start: interval.start
      });
      continue;
    }

    current.end = Math.max(current.end, interval.end);
    current.indices.push(interval.index);
  }

  return clusters;
}

function foldedAxisGap(intervals: readonly FoldedAxisInterval[]): number {
  const lengths = intervals
    .map((interval) => interval.end - interval.start)
    .filter((length) => length > 0)
    .sort((left, right) => left - right);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
  return median * FOLDED_GAP_RATIO;
}

function packedLayoutScale(
  bounds: CanvasCollageRect,
  contentFrame: CanvasCollageRect
): number {
  const fitScale = Math.min(
    contentFrame.width / bounds.width,
    contentFrame.height / bounds.height
  );
  return Math.max(0.01, fitScale * PACKED_CANVAS_MARGIN_SCALE);
}

function placePackedItems<T>(
  packedLayout: PackedCollageLayout<T>,
  contentFrame: CanvasCollageRect,
  scale: number
): CanvasCollagePackedPlacement<T>[] {
  const scaledWidth = packedLayout.bounds.width * scale;
  const scaledHeight = packedLayout.bounds.height * scale;
  const offsetX = contentFrame.x + (contentFrame.width - scaledWidth) / 2;
  const offsetY = contentFrame.y + (contentFrame.height - scaledHeight) / 2;

  return packedLayout.items.map(({ frame: packedFrame, item }) => {
    const frame = {
      height: packedFrame.height * scale,
      width: packedFrame.width * scale,
      x: offsetX + (packedFrame.x - packedLayout.bounds.x) * scale,
      y: offsetY + (packedFrame.y - packedLayout.bounds.y) * scale
    };
    const contentFrame = {
      height: item.source.height * scale,
      width: item.source.width * scale,
      x: frame.x + (item.source.x - item.bounds.x) * scale,
      y: frame.y + (item.source.y - item.bounds.y) * scale
    };

    return {
      contentFrame,
      frame,
      item: item.item
    };
  });
}
