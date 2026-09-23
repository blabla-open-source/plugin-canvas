export interface VideoPlaybackProgressSource {
  currentTime: number;
  duration: number;
}

export function videoPlaybackProgressRatio(
  source: VideoPlaybackProgressSource
): number | null {
  if (!(Number.isFinite(source.duration) && source.duration > 0)) {
    return null;
  }

  if (!Number.isFinite(source.currentTime)) {
    return null;
  }

  return Math.max(0, Math.min(1, source.currentTime / source.duration));
}

export function videoPlaybackSeekRatio(
  pointerX: number,
  width: number
): number | null {
  if (!(Number.isFinite(width) && width > 0)) {
    return null;
  }

  if (!Number.isFinite(pointerX)) {
    return null;
  }

  return Math.max(0, Math.min(1, pointerX / width));
}
