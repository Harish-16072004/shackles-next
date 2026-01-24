import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shackles 2025 | Symposium Registration",
  description: "Official registration portal for Shackles 2025.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Add suppressHydrationWarning here
    <html lang="en" suppressHydrationWarning>
      <body 
        // And here
        suppressHydrationWarning
        className={`${inter.className} min-h-screen flex flex-col bg-gray-50 text-gray-900 antialiased`}
      >
        {/* Simple Navbar Placeholder */}
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <h1 className="font-bold text-xl tracking-tight">SHACKLES '25</h1>
            <nav className="text-sm font-medium text-gray-500 gap-6 hidden md:flex">
              <a href="#" className="hover:text-black">Events</a>
              <a href="#" className="hover:text-black">Contact</a>
            </nav>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        
      </body>
    </html>
  );
}