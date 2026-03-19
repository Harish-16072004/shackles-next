"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState, useCallback, useMemo } from "react";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Workshops", href: "/workshops" },
  { label: "Accommodation", href: "/accommodation" },
  { label: "Team", href: "/team" },
  { label: "Contact", href: "/contact" },
];

export function NavLinks() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/" && pathname === "/") return true;
      if (href !== "/" && pathname.startsWith(href)) return true;
      return false;
    },
    [pathname]
  );

  const memoizedNavItems = useMemo(() => navItems, []);

  const handleLogout = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    console.log("Logout clicked");
  }, []);

  const handleMobileMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden items-center gap-8 md:flex">
        {memoizedNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            prefetch={true}
            onClick={handleMobileMenuClose}
            className={`text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "border-b-2 border-blue-500 pb-0.5 text-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Right Section - Admin & Logout */}
      <div className="hidden items-center gap-3 md:flex">
        <Link
          href="/admin/adminDashboard"
          prefetch={false}
          className="rounded-full border-2 border-pink-600 px-4 py-1.5 text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-600 hover:text-white"
        >
          Admin
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-full border-2 border-yellow-500 px-4 py-1.5 text-sm font-semibold text-yellow-600 transition-colors hover:bg-yellow-500 hover:text-white"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>

      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="md:hidden flex flex-col gap-1.5 p-2"
        aria-label="Toggle menu"
      >
        <span className="block h-0.5 w-6 bg-gray-900" />
        <span className="block h-0.5 w-6 bg-gray-900" />
        <span className="block h-0.5 w-6 bg-gray-900" />
      </button>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 pb-4 md:hidden">
          <nav className="flex flex-col gap-2 pt-4">
            {memoizedNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleMobileMenuClose}
                className={`block rounded px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="border-t border-gray-200 pt-2">
              <Link
                href="/admin/adminDashboard"
                prefetch={false}
                onClick={handleMobileMenuClose}
                className="block rounded border-2 border-pink-600 px-3 py-2 text-center text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-600 hover:text-white"
              >
                Admin
              </Link>
              <button
                onClick={() => {
                  handleLogout();
                  handleMobileMenuClose();
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded border-2 border-yellow-500 px-3 py-2 text-sm font-semibold text-yellow-600 transition-colors hover:bg-yellow-500 hover:text-white"
              >
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
