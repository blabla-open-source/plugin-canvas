import type { BlablaHostBridgeContext, BlablaHostThemeState } from "./host-api";

export function applyBlablaHostSurface(
  context: BlablaHostBridgeContext
): void {
  document.documentElement.dataset.surfaceBackground =
    context.surface.background;
}

export function applyBlablaHostTheme(theme: BlablaHostThemeState): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme.effective === "dark");
  root.dataset.theme = theme.effective;
  root.style.colorScheme = theme.effective;

  const style = root.style;
  style.setProperty("--background", theme.tokens.background);
  style.setProperty("--foreground", theme.tokens.foreground);
  style.setProperty("--surface", theme.tokens.surface);
  style.setProperty("--card", theme.tokens.surface);
  style.setProperty("--card-foreground", theme.tokens.foreground);
  style.setProperty("--popover", theme.tokens.surface);
  style.setProperty("--popover-foreground", theme.tokens.foreground);
  style.setProperty("--muted", theme.tokens.muted);
  style.setProperty("--muted-foreground", theme.tokens.mutedForeground);
  style.setProperty("--border", theme.tokens.border);
  style.setProperty("--accent", theme.tokens.accent);
  style.setProperty("--accent-foreground", theme.tokens.accentForeground);
  style.setProperty("--primary", theme.tokens.primary);
  style.setProperty("--primary-foreground", theme.tokens.primaryForeground);
  style.setProperty("--asset-action", theme.tokens.assetAction);
  style.setProperty("--lm-effective-primary", theme.tokens.primary);
  style.setProperty(
    "--lm-effective-primary-foreground",
    theme.tokens.primaryForeground
  );
}
