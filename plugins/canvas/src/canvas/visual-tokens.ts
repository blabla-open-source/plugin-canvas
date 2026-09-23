export const colorTokens = {
  accent: "#f5f5f5",
  border: "#cccccc",
  destructive: "#d30000",
  foreground: "#1d1d1f",
  muted: "#f7f7f7",
  mutedForeground: "#6e6e73",
  primary: "#10b981",
  surface: "#ffffff",
  warning: "#b45309"
} as const;

export const systemFontFamily =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", "Helvetica Neue", Arial, sans-serif' as const;

export const typographyTokens = {
  body: {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 20
  },
  meta: {
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 16
  },
  micro: {
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 14
  },
  nav: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 21
  }
} as const;
