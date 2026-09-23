import type { CanvasCollagePlacement } from "./canvas-collage-layout";
import {
  documentMetaText,
  TEXT_DOCUMENT_BODY_TYPE,
  TEXT_DOCUMENT_FONT_FAMILY,
  TEXT_DOCUMENT_HEADER_HEIGHT,
  TEXT_DOCUMENT_META_TYPE,
  TEXT_DOCUMENT_PADDING,
  TEXT_DOCUMENT_TITLE_TYPE,
  textDocumentContent
} from "./canvas-text-document-model";
import type { CanvasAsset } from "./types";
import { colorTokens } from "./visual-tokens";

const CARD_RADIUS = 8;
const CARD_FILL = `${colorTokens.muted}f0`;
const CARD_BORDER = `${colorTokens.foreground}1f`;
const CARD_TITLE = `${colorTokens.foreground}e6`;
const CARD_META = `${colorTokens.mutedForeground}cc`;
const CARD_BODY = `${colorTokens.foreground}b8`;
const MIN_TEXT_RENDER_SCALE = 0.32;
const MAX_TEXT_RENDER_SCALE = 0.72;
const WHITESPACE_PATTERN = /\s+/;
const WHITESPACE_GLOBAL_PATTERN = /\s+/g;

export function drawCanvasCollageFileCard(
  context: CanvasRenderingContext2D,
  placement: CanvasCollagePlacement,
  asset: CanvasAsset
) {
  const frame = placement.contentFrame;
  const scale = textRenderScale(placement);
  const radius = cardRadius(placement);
  const padding = Math.max(4, TEXT_DOCUMENT_PADDING * scale);
  const titleTop = Math.max(5, 24 * scale);
  const metaTop = Math.max(titleTop + 7, 42 * scale);
  const titleFontSize = Math.max(5, TEXT_DOCUMENT_TITLE_TYPE.fontSize * scale);
  const metaFontSize = Math.max(4, TEXT_DOCUMENT_META_TYPE.fontSize * scale);

  drawCardBackground(context, frame, radius);
  context.save();
  roundedRect(context, frame, radius);
  context.clip();
  context.fillStyle = CARD_TITLE;
  context.font = `700 ${titleFontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
  drawClippedText(context, asset.name, frame.x + padding, frame.y + titleTop, {
    maxWidth: frame.width - padding * 2
  });
  context.fillStyle = CARD_META;
  context.font = `${TEXT_DOCUMENT_META_TYPE.fontWeight} ${metaFontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
  drawClippedText(
    context,
    documentMetaText(asset),
    frame.x + padding,
    frame.y + metaTop,
    {
      maxWidth: frame.width - padding * 2
    }
  );
  context.restore();
}

export function drawCanvasCollageTextCard(
  context: CanvasRenderingContext2D,
  placement: CanvasCollagePlacement,
  asset: CanvasAsset
) {
  const frame = placement.contentFrame;
  const scale = textRenderScale(placement);
  const radius = cardRadius(placement);
  const content = textDocumentContent(asset);
  const padding = Math.max(4, TEXT_DOCUMENT_PADDING * scale);
  const titleTop = Math.max(4, 16 * scale);
  const metaTop = Math.max(titleTop + 6, 43 * scale);
  const bodyTop = Math.max(metaTop + 8, TEXT_DOCUMENT_HEADER_HEIGHT * scale);
  const titleFontSize = Math.max(5, TEXT_DOCUMENT_TITLE_TYPE.fontSize * scale);
  const metaFontSize = Math.max(4, TEXT_DOCUMENT_META_TYPE.fontSize * scale);
  const bodyFontSize = Math.max(4, TEXT_DOCUMENT_BODY_TYPE.fontSize * scale);
  const bodyLineHeight = Math.max(
    bodyFontSize + 2,
    TEXT_DOCUMENT_BODY_TYPE.lineHeight * scale
  );

  drawCardBackground(context, frame, radius);
  context.save();
  roundedRect(context, frame, radius);
  context.clip();

  context.fillStyle = CARD_TITLE;
  context.font = `700 ${titleFontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
  drawClippedText(
    context,
    content.title,
    frame.x + padding,
    frame.y + titleTop,
    {
      maxWidth: frame.width - padding * 2
    }
  );

  context.fillStyle = CARD_META;
  context.font = `${TEXT_DOCUMENT_META_TYPE.fontWeight} ${metaFontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
  drawClippedText(
    context,
    documentMetaText(asset),
    frame.x + padding,
    frame.y + metaTop,
    {
      maxWidth: frame.width - padding * 2
    }
  );

  context.fillStyle = CARD_BODY;
  context.font = `${TEXT_DOCUMENT_BODY_TYPE.fontWeight} ${bodyFontSize}px ${TEXT_DOCUMENT_FONT_FAMILY}`;
  const bodyY = frame.y + bodyTop;
  const bodyMaxLines = Math.max(
    0,
    Math.floor((frame.y + frame.height - bodyY - padding) / bodyLineHeight)
  );
  if (bodyMaxLines > 0) {
    drawWrappedText(
      context,
      content.body.trim().replace(WHITESPACE_GLOBAL_PATTERN, " "),
      {
        lineHeight: bodyLineHeight,
        maxLines: bodyMaxLines,
        maxWidth: frame.width - padding * 2,
        x: frame.x + padding,
        y: bodyY
      }
    );
  }

  context.restore();
}

function textRenderScale(placement: CanvasCollagePlacement): number {
  const sourceScale = placementSourceScale(placement);
  return Math.min(
    MAX_TEXT_RENDER_SCALE,
    Math.max(MIN_TEXT_RENDER_SCALE, sourceScale)
  );
}

function cardRadius(placement: CanvasCollagePlacement): number {
  return Math.min(
    8,
    Math.max(1.5, CARD_RADIUS * placementSourceScale(placement))
  );
}

function placementSourceScale(placement: CanvasCollagePlacement): number {
  return placement.candidate.source.width > 0
    ? placement.contentFrame.width / placement.candidate.source.width
    : 1;
}

function drawCardBackground(
  context: CanvasRenderingContext2D,
  frame: { height: number; width: number; x: number; y: number },
  radius: number
) {
  context.save();
  context.fillStyle = CARD_FILL;
  roundedRect(context, frame, radius);
  context.fill();
  context.strokeStyle = CARD_BORDER;
  context.lineWidth = 1;
  roundedRect(context, insetRect(frame, 0.5), radius);
  context.stroke();
  context.restore();
}

function roundedRect(
  context: CanvasRenderingContext2D,
  frame: { height: number; width: number; x: number; y: number },
  radius: number
) {
  const r = Math.min(radius, frame.width / 2, frame.height / 2);
  context.beginPath();
  context.moveTo(frame.x + r, frame.y);
  context.lineTo(frame.x + frame.width - r, frame.y);
  context.quadraticCurveTo(
    frame.x + frame.width,
    frame.y,
    frame.x + frame.width,
    frame.y + r
  );
  context.lineTo(frame.x + frame.width, frame.y + frame.height - r);
  context.quadraticCurveTo(
    frame.x + frame.width,
    frame.y + frame.height,
    frame.x + frame.width - r,
    frame.y + frame.height
  );
  context.lineTo(frame.x + r, frame.y + frame.height);
  context.quadraticCurveTo(
    frame.x,
    frame.y + frame.height,
    frame.x,
    frame.y + frame.height - r
  );
  context.lineTo(frame.x, frame.y + r);
  context.quadraticCurveTo(frame.x, frame.y, frame.x + r, frame.y);
  context.closePath();
}

function insetRect(
  frame: { height: number; width: number; x: number; y: number },
  inset: number
) {
  return {
    height: frame.height - inset * 2,
    width: frame.width - inset * 2,
    x: frame.x + inset,
    y: frame.y + inset
  };
}

function drawClippedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  { maxWidth }: { maxWidth: number }
) {
  if (!text) {
    return;
  }

  const ellipsis = "...";
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y, maxWidth);
    return;
  }

  let clipped = text;
  while (
    clipped.length > 0 &&
    context.measureText(`${clipped}${ellipsis}`).width > maxWidth
  ) {
    clipped = clipped.slice(0, -1);
  }
  context.fillText(`${clipped}${ellipsis}`, x, y, maxWidth);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  {
    lineHeight,
    maxLines,
    maxWidth,
    x,
    y
  }: {
    lineHeight: number;
    maxLines: number;
    maxWidth: number;
    x: number;
    y: number;
  }
) {
  if (!text) {
    return;
  }

  const words = text.split(WHITESPACE_PATTERN);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  lines.forEach((line, index) => {
    drawClippedText(context, line, x, y + index * lineHeight, { maxWidth });
  });
}
