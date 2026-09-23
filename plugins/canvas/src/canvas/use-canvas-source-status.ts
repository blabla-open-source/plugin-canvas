import { useMemo } from "react";
import {
  applyCanvasSourceSnapshotFallbacks,
  type CanvasSourceIssueMarker,
  type CanvasSourceReference,
  resolveCanvasEmbeddedSourceIssueMarkers,
  resolveCanvasSourceIssueMarkers
} from "./canvas-source-status";
import type { CanvasScene } from "./types";

export interface CanvasSourceStatusState {
  issueMarkers: CanvasSourceIssueMarker[];
  referencesForStatus: CanvasSourceReference[];
  runtimeScene: CanvasScene;
}

export function useCanvasSourceStatus({
  scene,
  sourceReferences
}: {
  scene: CanvasScene;
  sourceReferences?: readonly CanvasSourceReference[];
}): CanvasSourceStatusState {
  const referencesForStatus = useMemo(
    () =>
      sourceReferences ? mergeCanvasSourceReferenceLists(sourceReferences) : [],
    [sourceReferences]
  );
  const issueMarkers = useMemo(() => {
    const embeddedMarkers = resolveCanvasEmbeddedSourceIssueMarkers(scene);
    if (!sourceReferences) {
      return embeddedMarkers;
    }

    return mergeCanvasSourceIssueMarkers(
      resolveCanvasSourceIssueMarkers(scene, referencesForStatus),
      embeddedMarkers
    );
  }, [referencesForStatus, scene, sourceReferences]);
  const runtimeScene = useMemo(
    () =>
      sourceReferences
        ? applyCanvasSourceSnapshotFallbacks(scene, referencesForStatus)
        : scene,
    [referencesForStatus, scene, sourceReferences]
  );

  return {
    issueMarkers,
    referencesForStatus,
    runtimeScene
  };
}

export function mergeCanvasSourceReferenceLists(
  ...lists: readonly (readonly CanvasSourceReference[])[]
): CanvasSourceReference[] {
  const referencesById = new Map<string, CanvasSourceReference>();

  for (const list of lists) {
    for (const reference of list) {
      referencesById.set(reference.id, reference);
    }
  }

  return Array.from(referencesById.values());
}

export function mergeReadCanvasSourceReferences(
  current: readonly CanvasSourceReference[],
  references: readonly CanvasSourceReference[],
  requestedIds: readonly string[]
): CanvasSourceReference[] {
  const requestedIdSet = new Set(requestedIds);
  const referencesById = new Map(
    current
      .filter((reference) => !requestedIdSet.has(reference.id))
      .map((reference) => [reference.id, reference])
  );

  for (const reference of references) {
    referencesById.set(reference.id, reference);
  }

  return Array.from(referencesById.values());
}

function mergeCanvasSourceIssueMarkers(
  referenceMarkers: readonly CanvasSourceIssueMarker[],
  embeddedMarkers: readonly CanvasSourceIssueMarker[]
): CanvasSourceIssueMarker[] {
  const markers = [...referenceMarkers];
  const markerKeys = new Set(markers.map(sourceIssueMarkerKey));

  for (const marker of embeddedMarkers) {
    const key = sourceIssueMarkerKey(marker);
    if (markerKeys.has(key)) {
      continue;
    }

    markerKeys.add(key);
    markers.push(marker);
  }

  return markers;
}

function sourceIssueMarkerKey(marker: CanvasSourceIssueMarker): string {
  return `${marker.nodeId}:${marker.assetId}`;
}
