import type { ILeafer } from "leafer-ui";
import type { CanvasViewport } from "./types";
import { clientPointToCanvasPoint } from "./viewport-coordinates";

export interface CanvasWheelInput {
	altKey: boolean;
	clientX: number;
	clientY: number;
	ctrlKey: boolean;
	deltaMode: number;
	deltaX: number;
	deltaY: number;
	metaKey: boolean;
	shiftKey: boolean;
}
export const MIN_ZOOM = 0.08;
const MAX_ZOOM = 8;

export function readLeaferViewport(tree: ILeafer): CanvasViewport {
	const layer = tree.zoomLayer ?? tree;
	return { x: layer.x ?? 0, y: layer.y ?? 0, zoom: layer.scaleX ?? 1 };
}

export function setLeaferViewport(
	tree: ILeafer,
	viewport: CanvasViewport,
): void {
	const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom));
	(tree.zoomLayer ?? tree).set({
		scaleX: zoom,
		scaleY: zoom,
		x: viewport.x,
		y: viewport.y,
	});
}

export function leaferClientPoint(
	tree: ILeafer,
	view: HTMLElement,
	clientX: number,
	clientY: number,
) {
	return clientPointToCanvasPoint(
		clientX,
		clientY,
		view.getBoundingClientRect(),
		readLeaferViewport(tree),
	);
}

export function forwardCanvasWheel(
	tree: ILeafer,
	input: CanvasWheelInput,
): void {
	const canvas = tree.canvas.view;
	if (!(canvas instanceof HTMLElement)) return;
	canvas.dispatchEvent(
		new WheelEvent("wheel", {
			altKey: input.altKey,
			bubbles: true,
			cancelable: true,
			clientX: input.clientX,
			clientY: input.clientY,
			ctrlKey: input.ctrlKey,
			deltaMode: input.deltaMode,
			deltaX: input.deltaX,
			deltaY: input.deltaY,
			metaKey: input.metaKey,
			shiftKey: input.shiftKey,
		}),
	);
}
