interface CanvasWheelEvent {
  ctrlKey?: boolean;
  deltaX: number;
  deltaY: number;
  metaKey?: boolean;
  origin?: unknown;
  shiftKey?: boolean;
}

interface CanvasWheelConfig {
  moveSpeed?: number;
  zoomSpeed?: number;
}

interface WheelEventOrigin {
  deltaMode?: number;
  wheelDelta?: number;
  wheelDeltaX?: number;
  wheelDeltaY?: number;
}

const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const WHEEL_LINE_PX = 40;
const WHEEL_PAGE_PX = 800;
const MIN_MOUSE_NOTCH_PX = 40;
const MAX_DIRECT_DELTA_PX = 50;
const MAX_ZOOM_STEP = 10;
const DEFAULT_MOVE_SPEED = 0.5;
const MIN_WHEEL_SCALE = 0.5;
const MAX_WHEEL_SCALE = 2;

export const WHEEL_ZOOM_SPEED = 1;

export function canvasWheelMove(
  event: CanvasWheelEvent,
  config: CanvasWheelConfig
): { x: number; y: number } {
  const origin = wheelEventOrigin(event.origin);
  let deltaX = normalizeWheelDelta(event.deltaX, origin, "x");
  let deltaY = normalizeWheelDelta(event.deltaY, origin, "y");

  if (event.shiftKey && !deltaX) {
    deltaX = deltaY;
    deltaY = 0;
  }

  const moveSpeed = config.moveSpeed ?? DEFAULT_MOVE_SPEED;

  return {
    x: wheelMove(deltaX, moveSpeed),
    y: wheelMove(deltaY, moveSpeed)
  };
}

export function canvasWheelScale(
  event: CanvasWheelEvent,
  config: CanvasWheelConfig
): number {
  if (event.shiftKey || !(event.metaKey || event.ctrlKey)) {
    return 1;
  }

  const delta = event.deltaY || event.deltaX;

  if (!delta) {
    return 1;
  }

  const zoomSpeed = clamp(config.zoomSpeed ?? WHEEL_ZOOM_SPEED, 0, 1);
  const zoomDelta =
    (Math.abs(delta) > MAX_ZOOM_STEP
      ? MAX_ZOOM_STEP * Math.sign(delta)
      : delta) / 100;

  return clamp(1 - zoomDelta * zoomSpeed, MIN_WHEEL_SCALE, MAX_WHEEL_SCALE);
}

function normalizeWheelDelta(
  delta: number,
  origin: WheelEventOrigin | null,
  axis: "x" | "y"
): number {
  if (!delta) {
    return 0;
  }

  const mode = origin?.deltaMode ?? DOM_DELTA_PIXEL;

  if (mode === DOM_DELTA_LINE) {
    return delta * WHEEL_LINE_PX;
  }

  if (mode === DOM_DELTA_PAGE) {
    return delta * WHEEL_PAGE_PX;
  }

  const wheelDelta =
    axis === "x"
      ? origin?.wheelDeltaX
      : (origin?.wheelDeltaY ?? origin?.wheelDelta);

  if (
    Math.abs(delta) < MIN_MOUSE_NOTCH_PX &&
    Math.abs(wheelDelta ?? 0) >= 120
  ) {
    return Math.sign(delta) * MIN_MOUSE_NOTCH_PX;
  }

  return delta;
}

function clampWheelDelta(delta: number): number {
  const absDelta = Math.abs(delta);

  if (absDelta > MAX_DIRECT_DELTA_PX) {
    return Math.max(MAX_DIRECT_DELTA_PX, absDelta / 3) * Math.sign(delta);
  }

  return delta;
}

function wheelMove(delta: number, moveSpeed: number): number {
  return delta === 0 ? 0 : -clampWheelDelta(delta) * moveSpeed * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wheelEventOrigin(origin: unknown): WheelEventOrigin | null {
  return typeof origin === "object" && origin !== null
    ? (origin as WheelEventOrigin)
    : null;
}
