import { useCallback } from "react";
import {
	acknowledgeCanvasAssetSourceIssue,
	clearCanvasAssetSourceIssue,
} from "../canvas/scene-store";
import { updatePromotedCanvasAssetPreview } from "../canvas/canvas-scene-promoted-assets";
import type { CanvasSourceIssueMarker } from "../canvas/canvas-source-status";
import type { CanvasScene } from "../canvas/types";
import type { BlablaHostFileReference } from "./host-api";
import { fileReferenceToPromotedCanvasAsset } from "./host-file-reference-promoted-asset";

export function useCanvasSourceIssueActions(
	applySceneChange: (update: (scene: CanvasScene) => CanvasScene) => void,
	fileReferencesById: Record<string, BlablaHostFileReference>,
	setError: (message: string) => void,
) {
	const keepSourceIssueCurrent = useCallback(
		(marker: CanvasSourceIssueMarker) => {
			if (marker.status === "unsupported") {
				applySceneChange((scene) =>
					clearCanvasAssetSourceIssue(scene, marker.assetId),
				);
				return;
			}

			applySceneChange((scene) =>
				acknowledgeCanvasAssetSourceIssue(scene, marker.assetId, {
					currentFingerprint: marker.currentFingerprint,
					status: marker.status,
				}),
			);
		},
		[applySceneChange],
	);

	const syncSourceIssueToLatest = useCallback(
		(marker: CanvasSourceIssueMarker) => {
			const reference = fileReferencesById[marker.sourceAssetId];
			if (!reference) {
				setError("File reference is not available.");
				return;
			}

			applySceneChange((scene) =>
				updatePromotedCanvasAssetPreview(
					scene,
					fileReferenceToPromotedCanvasAsset(reference, {
						assetId: marker.assetId,
					}),
				),
			);
		},
		[applySceneChange, fileReferencesById, setError],
	);

	return { keepSourceIssueCurrent, syncSourceIssueToLatest };
}
