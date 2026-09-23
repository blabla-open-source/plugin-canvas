import {
  type LayoutCursor,
  layoutNextLine,
  prepareWithSegments
} from "@chenglou/pretext";
import type { CanvasAsset, CanvasTextObstacle } from "./types";
import { systemFontFamily, typographyTokens } from "./visual-tokens";

export const TEXT_DOCUMENT_PADDING = 20;
export const TEXT_DOCUMENT_HEADER_HEIGHT = 72;
export const TEXT_DOCUMENT_FONT_FAMILY = systemFontFamily;
export const TEXT_DOCUMENT_TITLE_TYPE = typographyTokens.body;
export const TEXT_DOCUMENT_META_TYPE = typographyTokens.meta;
export const TEXT_DOCUMENT_BODY_TYPE = typographyTokens.body;
export const TEXT_DOCUMENT_BODY_FONT = `${TEXT_DOCUMENT_BODY_TYPE.fontWeight} ${TEXT_DOCUMENT_BODY_TYPE.fontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
export const TEXT_DOCUMENT_MIN_LINE_SLOT_WIDTH = 92;
export const TEXT_DOCUMENT_OBSTACLE_SIZE = {
  height: 86,
  width: 138
};
export const TEXT_DOCUMENT_MAX_LAYOUT_LINES = 5000;
export const TEXT_DOCUMENT_SCROLL_EDITOR_TAG = "TextDocumentScrollEditor";

export interface TextDocumentBodyLine {
  slotWidth: number;
  text: string;
  x: number;
  y: number;
}

export function layoutTextDocumentLines(
  text: string,
  cardWidth: number,
  obstacle: CanvasTextObstacle | null
): TextDocumentBodyLine[] {
  const bodyTop = TEXT_DOCUMENT_HEADER_HEIGHT;
  const base = {
    left: TEXT_DOCUMENT_PADDING,
    right: Math.max(
      TEXT_DOCUMENT_PADDING + 1,
      cardWidth - TEXT_DOCUMENT_PADDING
    )
  };
  const prepared = prepareWithSegments(
    normalizeTextContent(text),
    TEXT_DOCUMENT_BODY_FONT,
    {
      whiteSpace: "pre-wrap"
    }
  );
  const lines: TextDocumentBodyLine[] = [];
  let cursor: LayoutCursor = { graphemeIndex: 0, segmentIndex: 0 };
  let lineTop = bodyTop;

  for (let index = 0; index < TEXT_DOCUMENT_MAX_LAYOUT_LINES; index += 1) {
    const blocked =
      obstacle &&
      lineTop + TEXT_DOCUMENT_BODY_TYPE.lineHeight > obstacle.y - 4 &&
      lineTop < obstacle.y + obstacle.height + 4
        ? [
            {
              left: obstacle.x - 12,
              right: obstacle.x + obstacle.width + 12
            }
          ]
        : [];
    const slots = carveTextLineSlots(base, blocked);

    if (slots.length === 0) {
      lineTop += TEXT_DOCUMENT_BODY_TYPE.lineHeight;
      continue;
    }

    const slot = widestTextLineSlot(slots);
    const previousCursor = cursor;
    const line = layoutNextLine(prepared, cursor, slot.right - slot.left);

    if (!line) {
      break;
    }

    lines.push({
      slotWidth: slot.right - slot.left,
      text: line.text,
      x: Math.round(slot.left),
      y: Math.round(lineTop)
    });
    cursor = line.end;

    if (sameLayoutCursor(previousCursor, cursor)) {
      break;
    }

    lineTop += TEXT_DOCUMENT_BODY_TYPE.lineHeight;
  }

  return lines;
}

export function textDocumentObstacle(
  asset: CanvasAsset,
  cardWidth: number,
  cardHeight: number
): CanvasTextObstacle | null {
  if (!asset.textObstacle) {
    return null;
  }

  if (
    cardWidth <
      TEXT_DOCUMENT_PADDING * 2 +
        TEXT_DOCUMENT_OBSTACLE_SIZE.width +
        TEXT_DOCUMENT_MIN_LINE_SLOT_WIDTH ||
    cardHeight < 220
  ) {
    return null;
  }

  return clampTextDocumentObstacle(asset.textObstacle, cardWidth, cardHeight);
}

export function clampTextDocumentObstacle(
  obstacle: CanvasTextObstacle,
  cardWidth: number,
  cardHeight: number
): CanvasTextObstacle {
  const width = Math.min(
    Math.max(1, obstacle.width),
    Math.max(1, cardWidth - TEXT_DOCUMENT_PADDING * 2)
  );
  const height = Math.min(
    Math.max(1, obstacle.height),
    Math.max(1, cardHeight - TEXT_DOCUMENT_HEADER_HEIGHT)
  );
  const minX = TEXT_DOCUMENT_PADDING;
  const maxX = Math.max(minX, cardWidth - TEXT_DOCUMENT_PADDING - width);
  const minY = TEXT_DOCUMENT_HEADER_HEIGHT;
  const maxY = Math.max(minY, cardHeight - TEXT_DOCUMENT_PADDING - height);

  return {
    height: Math.round(height),
    width: Math.round(width),
    x: Math.round(clampNumber(obstacle.x, minX, maxX)),
    y: Math.round(clampNumber(obstacle.y, minY, maxY))
  };
}

export function normalizeTextContent(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  return normalized.trim().length > 0 ? normalized : "Empty text document";
}

export function textDocumentContent(asset: CanvasAsset): {
  body: string;
  title: string;
} {
  const text = normalizeTextContent(
    asset.acceptedTextSnapshot ?? asset.textContent ?? ""
  );
  const lines = text.split("\n");
  const first = lines[0]?.trim();

  if (first?.startsWith("# ")) {
    return {
      body: lines.slice(1).join("\n").trim() || text,
      title: first.slice(2).trim() || asset.name
    };
  }

  return { body: text, title: asset.name };
}

export function documentMetaText(asset: CanvasAsset): string {
  const byteSize = asset.byteSize ? formatByteSize(asset.byteSize) : null;
  return [asset.mime, byteSize].filter(Boolean).join(" · ");
}

export function isTextDocumentAsset(asset: CanvasAsset): boolean {
  return (
    typeof asset.acceptedTextSnapshot === "string" ||
    typeof asset.textContent === "string"
  );
}

export function textDocumentLayoutHash(
  cardWidth: number,
  obstacle: CanvasTextObstacle | null,
  bodyText: string
): string {
  const obstacleHash = obstacle
    ? `${obstacle.x},${obstacle.y},${obstacle.width},${obstacle.height}`
    : "";

  return `${Math.round(cardWidth)}|${obstacleHash}|${hashTextContent(
    bodyText
  )}`;
}

function formatByteSize(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 100 * 1024 ? 1 : 0)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function carveTextLineSlots(
  base: { left: number; right: number },
  blocked: readonly { left: number; right: number }[]
): Array<{ left: number; right: number }> {
  let slots = [base];

  for (const interval of blocked) {
    const next: Array<{ left: number; right: number }> = [];

    for (const slot of slots) {
      if (interval.right <= slot.left || interval.left >= slot.right) {
        next.push(slot);
        continue;
      }

      if (interval.left > slot.left) {
        next.push({ left: slot.left, right: interval.left });
      }

      if (interval.right < slot.right) {
        next.push({ left: interval.right, right: slot.right });
      }
    }

    slots = next;
  }

  return slots.filter(
    (slot) => slot.right - slot.left >= TEXT_DOCUMENT_MIN_LINE_SLOT_WIDTH
  );
}

function widestTextLineSlot(slots: Array<{ left: number; right: number }>): {
  left: number;
  right: number;
} {
  return slots.reduce((best, slot) =>
    slot.right - slot.left > best.right - best.left ? slot : best
  );
}

function sameLayoutCursor(left: LayoutCursor, right: LayoutCursor): boolean {
  return (
    left.segmentIndex === right.segmentIndex &&
    left.graphemeIndex === right.graphemeIndex
  );
}

function hashTextContent(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000_007;
  }

  return `${value.length}:${hash}`;
}
