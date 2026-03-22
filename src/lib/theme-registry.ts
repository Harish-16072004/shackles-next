export type ThemeConfig = {
  key: string;
  titleSuffix: string;
  description: string;
  themeColor: string;
  backgroundColor: string;
};

const DEFAULT_THEME: ThemeConfig = {
  key: "default",
  titleSuffix: "Shackles Symposium",
  description: "Official registration portal for Shackles Symposium.",
  themeColor: "#111827",
  backgroundColor: "#f9fafb",
};

const THEME_REGISTRY: Record<string, ThemeConfig> = {
  default: DEFAULT_THEME,
  classic: {
    key: "classic",
    titleSuffix: "Shackles Classic Edition",
    description: "Classic visual identity for the Shackles yearly edition.",
    themeColor: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  future: {
    key: "future",
    titleSuffix: "Shackles Future Edition",
    description: "Future-forward visual identity for the Shackles yearly edition.",
    themeColor: "#0b3d2e",
    backgroundColor: "#ecfdf5",
  },
};

export function resolveThemeConfig(themeKey: string | null | undefined): ThemeConfig {
  const normalized = (themeKey || "").trim().toLowerCase();
  return THEME_REGISTRY[normalized] ?? DEFAULT_THEME;
}
