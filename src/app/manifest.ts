import type { MetadataRoute } from "next";
import { getActiveYear, getActiveThemeKey } from "@/lib/edition";
import { resolveThemeConfig } from "@/lib/theme-registry";

export default function manifest(): MetadataRoute.Manifest {
  const year = getActiveYear();
  const theme = resolveThemeConfig(getActiveThemeKey());
  const version = `${year}-${theme.key}`;

  return {
    id: `/manifest-${version}`,
    name: `Shackles ${year}`,
    short_name: "Shackles",
    description: `${theme.description} ${year} edition.`,
    start_url: `/?edition=${encodeURIComponent(version)}`,
    display: "standalone",
    background_color: theme.backgroundColor,
    theme_color: theme.themeColor,
    icons: [
      {
        src: "/pwa-icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/pwa-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
