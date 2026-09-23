import { useEffect, useRef } from "react";
import {
	type CanvasSession,
	canvasSessionToDocument,
} from "../canvas/canvas-session";
import { serializeCanvasDocumentToJsonCanvas } from "../canvas/json-canvas-document";
import type { BlablaHostBridge } from "./host-api";

interface MutableValue<T> {
	current: T;
}

interface UseHostContentPreservationInput {
	autosaveTimeoutRef: MutableValue<number | null>;
	contentRevisionRef: MutableValue<number>;
	hostBridge: BlablaHostBridge | null;
	hostBridgeRef: MutableValue<BlablaHostBridge | null>;
	loaded: boolean;
	onError: (message: string) => void;
	queueDocumentSave: () => Promise<number>;
	session: CanvasSession | null;
	sessionRef: MutableValue<CanvasSession | null>;
	sourceTextBaselineRef: MutableValue<string | null>;
}

export function useHostContentPreservation({
	autosaveTimeoutRef,
	contentRevisionRef,
	hostBridge,
	hostBridgeRef,
	loaded,
	onError,
	queueDocumentSave,
	session,
	sessionRef,
	sourceTextBaselineRef,
}: UseHostContentPreservationInput): void {
	const lifecycleReadyRef = useRef(false);

	useEffect(() => {
		if (!loaded || !session) {
			return undefined;
		}
		const document = canvasSessionToDocument(session);
		if (
			hostBridgeRef.current &&
			sourceTextBaselineRef.current ===
				serializeCanvasDocumentToJsonCanvas(document)
		) {
			return undefined;
		}
		contentRevisionRef.current += 1;
		void hostBridgeRef.current?.surface.setDirty({
			dirty: true,
			revision: contentRevisionRef.current,
		});
		if (autosaveTimeoutRef.current !== null) {
			window.clearTimeout(autosaveTimeoutRef.current);
		}
		const timeout = window.setTimeout(() => {
			autosaveTimeoutRef.current = null;
			void queueDocumentSave().catch((error) => {
				onError(error instanceof Error ? error.message : String(error));
			});
		}, 350);
		autosaveTimeoutRef.current = timeout;
		return () => {
			window.clearTimeout(timeout);
			if (autosaveTimeoutRef.current === timeout) {
				autosaveTimeoutRef.current = null;
			}
		};
	}, [
		autosaveTimeoutRef,
		contentRevisionRef,
		hostBridgeRef,
		loaded,
		onError,
		queueDocumentSave,
		session,
		sourceTextBaselineRef,
	]);

	useEffect(() => {
		if (!(hostBridge && loaded && session)) {
			return;
		}
		const preservation = hostBridge.lifecycle.onPrepareDestroy(async () => {
			const currentSession = sessionRef.current;
			if (!currentSession) {
				return { revision: contentRevisionRef.current, status: "clean" };
			}
			const document = canvasSessionToDocument(currentSession);
			if (
				sourceTextBaselineRef.current ===
				serializeCanvasDocumentToJsonCanvas(document)
			) {
				return { revision: contentRevisionRef.current, status: "clean" };
			}
			if (autosaveTimeoutRef.current !== null) {
				window.clearTimeout(autosaveTimeoutRef.current);
				autosaveTimeoutRef.current = null;
			}
			try {
				return {
					revision: await queueDocumentSave(),
					status: "saved",
				};
			} catch {
				return {
					failure: "save-failed",
					revision: contentRevisionRef.current,
					status: "blocked",
				};
			}
		});
		if (!lifecycleReadyRef.current) {
			lifecycleReadyRef.current = true;
			hostBridge.lifecycle
				.ready({ saveMode: "autosave", title: session.name })
				.catch((error) => {
					onError(error instanceof Error ? error.message : String(error));
				});
		}
		return () => preservation.dispose();
	}, [
		autosaveTimeoutRef,
		contentRevisionRef,
		hostBridge,
		loaded,
		onError,
		queueDocumentSave,
		session,
		sessionRef,
		sourceTextBaselineRef,
	]);
}
