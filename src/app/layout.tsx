import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/common/Header";
import { getActiveYear } from "@/lib/edition";
import "./globals.css";

const inter = Inter({ 
  subsets: ["latin"],
  display: 'swap',
  fallback: ['system-ui', 'arial'],
  preload: true,
});

const activeYear = getActiveYear();

export const metadata: Metadata = {
  title: `Shackles ${activeYear} | Symposium Registration`,
  description: `Official registration portal for Shackles ${activeYear}.`,
  manifest: "/manifest.json",
  themeColor: "#111827",
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