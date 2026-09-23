export function visibleCanvasInsertionClientPoint(surface: HTMLElement): {
  x: number;
  y: number;
} {
  const bounds = surface.getBoundingClientRect();
  const candidates = [
    { x: 0.5, y: 0.5 },
    { x: 0.72, y: 0.5 },
    { x: 0.28, y: 0.5 },
    { x: 0.5, y: 0.32 },
    { x: 0.5, y: 0.68 },
    { x: 0.82, y: 0.35 },
    { x: 0.18, y: 0.35 },
    { x: 0.82, y: 0.65 },
    { x: 0.18, y: 0.65 }
  ].map((point) => ({
    x: bounds.left + bounds.width * point.x,
    y: bounds.top + bounds.height * point.y
  }));

  const shelfRects = Array.from(
    surface.querySelectorAll<HTMLElement>("[data-file-reference-shelf]")
  ).map((element) => element.getBoundingClientRect());
  const fallback = {
    x: bounds.left + bounds.width * 0.5,
    y: bounds.top + bounds.height * 0.5
  };

  return (
    candidates.find(
      (point) =>
        !shelfRects.some(
          (rect) =>
            point.x >= rect.left &&
            point.x <= rect.right &&
            point.y >= rect.top &&
            point.y <= rect.bottom
        )
    ) ?? fallback
  );
}
