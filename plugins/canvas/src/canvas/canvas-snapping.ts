export const DEFAULT_CANVAS_SNAP_THRESHOLD = 8;

const SNAP_EPSILON = 0.0001;

export interface CanvasMoveSnapInput {
  candidates: readonly CanvasSnapBox[];
  move: CanvasSnapMove;
  selected: readonly CanvasSnapBox[];
  threshold?: number;
}

export interface CanvasMoveSnapResult {
  lines: CanvasSnapLine[];
  nudgeX: number;
  nudgeY: number;
}

export interface CanvasScaleSnapInput {
  candidates: readonly CanvasSnapBox[];
  origin: CanvasSnapPoint;
  preserveAspectRatio?: boolean;
  scaleX: number;
  scaleY: number;
  selected: readonly CanvasSnapBox[];
  threshold?: number;
}

export interface CanvasScaleSnapResult {
  lines: CanvasSnapLine[];
  scaleX: number;
  scaleY: number;
}

export interface CanvasSnapBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface CanvasSnapBox extends CanvasSnapBounds {
  id: string;
  preserveAspectRatio?: boolean;
}

export interface CanvasSnapLine {
  axis: "x" | "y";
  end: number;
  start: number;
  value: number;
}

export interface CanvasSnapPoint {
  x: number;
  y: number;
}

interface AxisSnap {
  offset: number;
  pairs: AxisSnapPair[];
}

interface AxisSnapPair {
  candidate: CanvasSnapBox;
  candidateValue: number;
}

interface CanvasSnapMove {
  x: number;
  y: number;
}

interface ScaleAxisSnap extends AxisSnap {
  scale: number;
}

interface ScaleAxisSnapContext {
  axis: "x" | "y";
  originValue: number;
  scale: number;
  subject: CanvasSnapBox;
  subjectStart: number;
  threshold: number;
}

export function computeCanvasMoveSnap({
  candidates,
  move,
  selected,
  threshold = DEFAULT_CANVAS_SNAP_THRESHOLD
}: CanvasMoveSnapInput): CanvasMoveSnapResult {
  const subject = combinedSnapBox(selected);
  const snapThreshold = validThreshold(threshold);

  if (!(subject && snapThreshold > 0)) {
    return emptySnapResult();
  }

  const selectedIds = new Set(selected.map((box) => box.id));
  const candidateBoxes = candidates.filter(
    (box) => !selectedIds.has(box.id) && isValidSnapBox(box)
  );

  if (candidateBoxes.length === 0) {
    return emptySnapResult();
  }

  const movedSubject = {
    ...subject,
    x: subject.x + move.x,
    y: subject.y + move.y
  };
  const xSnap = collectAxisSnap({
    axis: "x",
    candidates: candidateBoxes,
    subject: movedSubject,
    threshold: snapThreshold
  });
  const ySnap = collectAxisSnap({
    axis: "y",
    candidates: candidateBoxes,
    subject: movedSubject,
    threshold: snapThreshold
  });
  const snappedSubject = {
    ...movedSubject,
    x: movedSubject.x + (xSnap?.offset ?? 0),
    y: movedSubject.y + (ySnap?.offset ?? 0)
  };

  return {
    lines: dedupeSnapLines([
      ...snapLinesForAxis("x", xSnap, snappedSubject),
      ...snapLinesForAxis("y", ySnap, snappedSubject)
    ]),
    nudgeX: xSnap?.offset ?? 0,
    nudgeY: ySnap?.offset ?? 0
  };
}

export function computeCanvasScaleSnap({
  candidates,
  origin,
  preserveAspectRatio = false,
  scaleX,
  scaleY,
  selected,
  threshold = DEFAULT_CANVAS_SNAP_THRESHOLD
}: CanvasScaleSnapInput): CanvasScaleSnapResult {
  const subject = combinedSnapBox(selected);
  const snapThreshold = validThreshold(threshold);
  const normalizedScale = preserveAspectRatio
    ? aspectPreservedScale(scaleX, scaleY)
    : { scaleX, scaleY };

  if (!(subject && snapThreshold > 0 && isValidSnapPoint(origin))) {
    return emptyScaleSnapResult(normalizedScale.scaleX, normalizedScale.scaleY);
  }

  const selectedIds = new Set(selected.map((box) => box.id));
  const candidateBoxes = candidates.filter(
    (box) => !selectedIds.has(box.id) && isValidSnapBox(box)
  );

  if (candidateBoxes.length === 0) {
    return emptyScaleSnapResult(normalizedScale.scaleX, normalizedScale.scaleY);
  }

  const xSnap = isScaling(normalizedScale.scaleX)
    ? collectScaleAxisSnap({
        axis: "x",
        candidates: candidateBoxes,
        originValue: origin.x,
        scale: normalizedScale.scaleX,
        subject,
        threshold: snapThreshold
      })
    : null;
  const ySnap = isScaling(normalizedScale.scaleY)
    ? collectScaleAxisSnap({
        axis: "y",
        candidates: candidateBoxes,
        originValue: origin.y,
        scale: normalizedScale.scaleY,
        subject,
        threshold: snapThreshold
      })
    : null;

  if (preserveAspectRatio) {
    const snap = closestScaleSnap(xSnap, ySnap);
    const nextScale = snap?.scale;
    const snappedSubject =
      nextScale === undefined
        ? null
        : scaleSnapBox(subject, origin, nextScale, nextScale);

    return {
      lines: snappedSubject
        ? snapLinesForAxis(snap === xSnap ? "x" : "y", snap, snappedSubject)
        : [],
      scaleX: nextScale ?? normalizedScale.scaleX,
      scaleY: nextScale ?? normalizedScale.scaleY
    };
  }

  const nextScaleX = xSnap?.scale ?? normalizedScale.scaleX;
  const nextScaleY = ySnap?.scale ?? normalizedScale.scaleY;
  const snappedSubject = scaleSnapBox(subject, origin, nextScaleX, nextScaleY);

  return {
    lines: dedupeSnapLines([
      ...snapLinesForAxis("x", xSnap, snappedSubject),
      ...snapLinesForAxis("y", ySnap, snappedSubject)
    ]),
    scaleX: nextScaleX,
    scaleY: nextScaleY
  };
}

export function canvasSnapBoundsIntersect(
  left: CanvasSnapBounds,
  right: CanvasSnapBounds
): boolean {
  if (!(isValidSnapBounds(left) && isValidSnapBounds(right))) {
    return false;
  }

  return !(
    left.x + left.width < right.x ||
    left.x > right.x + right.width ||
    left.y + left.height < right.y ||
    left.y > right.y + right.height
  );
}

export function filterCanvasSnapBoxesByBounds(
  boxes: readonly CanvasSnapBox[],
  bounds: CanvasSnapBounds
): CanvasSnapBox[] {
  return boxes.filter((box) => canvasSnapBoundsIntersect(bounds, box));
}

function collectAxisSnap({
  axis,
  candidates,
  subject,
  threshold
}: {
  axis: "x" | "y";
  candidates: readonly CanvasSnapBox[];
  subject: CanvasSnapBox;
  threshold: number;
}): AxisSnap | null {
  let best: AxisSnap | null = null;

  for (const candidate of candidates) {
    const candidatePoints = axisPoints(candidate, axis);
    const subjectPoints = axisPoints(subject, axis);

    for (const subjectValue of subjectPoints) {
      for (const candidateValue of candidatePoints) {
        const offset = candidateValue - subjectValue;
        const distance = Math.abs(offset);

        if (distance > threshold) {
          continue;
        }

        if (!best || distance < Math.abs(best.offset) - SNAP_EPSILON) {
          best = {
            offset,
            pairs: [{ candidate, candidateValue }]
          };
          continue;
        }

        if (
          nearlyEqual(distance, Math.abs(best.offset)) &&
          nearlyEqual(offset, best.offset)
        ) {
          best.pairs.push({ candidate, candidateValue });
        }
      }
    }
  }

  return best;
}

function collectScaleAxisSnap({
  axis,
  candidates,
  originValue,
  scale,
  subject,
  threshold
}: {
  axis: "x" | "y";
  candidates: readonly CanvasSnapBox[];
  originValue: number;
  scale: number;
  subject: CanvasSnapBox;
  threshold: number;
}): ScaleAxisSnap | null {
  const context: ScaleAxisSnapContext = {
    axis,
    originValue,
    scale,
    subject,
    subjectStart: axis === "x" ? subject.x : subject.y,
    threshold
  };
  let best: ScaleAxisSnap | null = null;

  for (const candidate of candidates) {
    best = betterScaleAxisSnap(
      best,
      collectCandidateScaleAxisSnap(context, candidate)
    );
  }

  return best;
}

function collectCandidateScaleAxisSnap(
  context: ScaleAxisSnapContext,
  candidate: CanvasSnapBox
): ScaleAxisSnap | null {
  let best: ScaleAxisSnap | null = null;
  const candidatePoints = axisPoints(candidate, context.axis);
  const subjectPoints = axisLocalPoints(context.subject, context.axis);

  for (const subjectPoint of subjectPoints) {
    for (const candidateValue of candidatePoints) {
      best = betterScaleAxisSnap(
        best,
        scaleAxisSnapForPoints(context, candidate, subjectPoint, candidateValue)
      );
    }
  }

  return best;
}

function scaleAxisSnapForPoints(
  context: ScaleAxisSnapContext,
  candidate: CanvasSnapBox,
  subjectPoint: number,
  candidateValue: number
): ScaleAxisSnap | null {
  const denominator = subjectPoint - context.originValue;

  if (Math.abs(denominator) <= SNAP_EPSILON) {
    return null;
  }

  const subjectValue = scaledAxisValue(
    context.subjectStart,
    context.originValue,
    subjectPoint,
    context.scale
  );
  const offset = candidateValue - subjectValue;
  const distance = Math.abs(offset);

  if (distance > context.threshold) {
    return null;
  }

  const nextScale =
    (candidateValue - context.subjectStart - context.originValue) / denominator;

  if (!(Number.isFinite(nextScale) && nextScale > SNAP_EPSILON)) {
    return null;
  }

  return {
    offset,
    pairs: [{ candidate, candidateValue }],
    scale: nextScale
  };
}

function betterScaleAxisSnap(
  current: ScaleAxisSnap | null,
  next: ScaleAxisSnap | null
): ScaleAxisSnap | null {
  if (!next) {
    return current;
  }
  if (!current) {
    return next;
  }

  const nextDistance = Math.abs(next.offset);
  const currentDistance = Math.abs(current.offset);

  if (nextDistance < currentDistance - SNAP_EPSILON) {
    return next;
  }

  if (
    nearlyEqual(nextDistance, currentDistance) &&
    nearlyEqual(next.scale, current.scale)
  ) {
    current.pairs.push(...next.pairs);
  }

  return current;
}

function snapLinesForAxis(
  axis: "x" | "y",
  snap: AxisSnap | null,
  subject: CanvasSnapBox
): CanvasSnapLine[] {
  if (!snap) {
    return [];
  }

  return snap.pairs.map(({ candidate, candidateValue }) => {
    if (axis === "x") {
      return {
        axis,
        end: Math.max(
          subject.y + subject.height,
          candidate.y + candidate.height
        ),
        start: Math.min(subject.y, candidate.y),
        value: candidateValue
      };
    }

    return {
      axis,
      end: Math.max(subject.x + subject.width, candidate.x + candidate.width),
      start: Math.min(subject.x, candidate.x),
      value: candidateValue
    };
  });
}

function combinedSnapBox(boxes: readonly CanvasSnapBox[]): CanvasSnapBox | null {
  const validBoxes = boxes.filter(isValidSnapBox);

  if (validBoxes.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const box of validBoxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return {
    height: maxY - minY,
    id: "$selection",
    width: maxX - minX,
    x: minX,
    y: minY
  };
}

function axisPoints(box: CanvasSnapBox, axis: "x" | "y"): number[] {
  if (axis === "x") {
    return [box.x, box.x + box.width / 2, box.x + box.width];
  }

  return [box.y, box.y + box.height / 2, box.y + box.height];
}

function axisLocalPoints(box: CanvasSnapBox, axis: "x" | "y"): number[] {
  if (axis === "x") {
    return [0, box.width / 2, box.width];
  }

  return [0, box.height / 2, box.height];
}

function aspectPreservedScale(
  scaleX: number,
  scaleY: number
): { scaleX: number; scaleY: number } {
  const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;

  return {
    scaleX: scale,
    scaleY: scale
  };
}

function closestScaleSnap(
  xSnap: ScaleAxisSnap | null,
  ySnap: ScaleAxisSnap | null
): ScaleAxisSnap | null {
  if (!xSnap) {
    return ySnap;
  }
  if (!ySnap) {
    return xSnap;
  }

  return Math.abs(xSnap.offset) <= Math.abs(ySnap.offset) ? xSnap : ySnap;
}

function dedupeSnapLines(lines: readonly CanvasSnapLine[]): CanvasSnapLine[] {
  const seen = new Set<string>();
  const deduped: CanvasSnapLine[] = [];

  for (const line of lines) {
    const key = `${line.axis}:${snapLineKey(line.value)}:${snapLineKey(
      line.start
    )}:${snapLineKey(line.end)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(line);
  }

  return deduped;
}

function emptySnapResult(): CanvasMoveSnapResult {
  return {
    lines: [],
    nudgeX: 0,
    nudgeY: 0
  };
}

function emptyScaleSnapResult(
  scaleX: number,
  scaleY: number
): CanvasScaleSnapResult {
  return {
    lines: [],
    scaleX,
    scaleY
  };
}

function isValidSnapBox(box: CanvasSnapBox): boolean {
  return isValidSnapBounds(box);
}

function isValidSnapBounds(bounds: CanvasSnapBounds): boolean {
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}

function isValidSnapPoint(point: CanvasSnapPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isScaling(scale: number): boolean {
  return Number.isFinite(scale) && Math.abs(scale - 1) > SNAP_EPSILON;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= SNAP_EPSILON;
}

function scaleSnapBox(
  box: CanvasSnapBox,
  origin: CanvasSnapPoint,
  scaleX: number,
  scaleY: number
): CanvasSnapBox {
  const left = scaledAxisValue(box.x, origin.x, 0, scaleX);
  const right = scaledAxisValue(box.x, origin.x, box.width, scaleX);
  const top = scaledAxisValue(box.y, origin.y, 0, scaleY);
  const bottom = scaledAxisValue(box.y, origin.y, box.height, scaleY);

  return {
    height: Math.abs(bottom - top),
    id: box.id,
    width: Math.abs(right - left),
    x: Math.min(left, right),
    y: Math.min(top, bottom)
  };
}

function scaledAxisValue(
  subjectStart: number,
  originValue: number,
  subjectPoint: number,
  scale: number
): number {
  return subjectStart + originValue + (subjectPoint - originValue) * scale;
}

function snapLineKey(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function validThreshold(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
