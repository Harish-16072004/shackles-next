import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/common/Header";
import { getActivePublicDomain, getActiveThemeKey, getActiveYear } from "@/lib/edition";
import { resolveThemeConfig } from "@/lib/theme-registry";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial'],
  preload: true,
});

const activeYear = getActiveYear();
const activeDomain = getActivePublicDomain();
const activeTheme = resolveThemeConfig(getActiveThemeKey());
const manifestVersion = `${activeYear}-${activeTheme.key}`;

export const metadata: Metadata = {
  title: `Shackles ${activeYear} | ${activeTheme.titleSuffix}`,
  description: `${activeTheme.description} ${activeYear} edition on ${activeDomain}.`,
  manifest: `/manifest.webmanifest?v=${encodeURIComponent(manifestVersion)}`,
  themeColor: activeTheme.themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased`}>
        <Header />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}