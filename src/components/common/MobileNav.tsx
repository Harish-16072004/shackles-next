"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

interface MobileNavProps {
  navItems: NavItem[];
  profileName: string | null;
  profileHref: string;
  onLogoutAction: () => void;
}

export default function MobileNav({
  navItems,
  profileName,
  profileHref,
  onLogoutAction,
}: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <div className="lg:hidden flex items-center">
      <button
        onClick={toggleMenu}
        aria-label="Toggle Menu"
        className="p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isOpen ? (
            <path d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="absolute top-16 left-0 w-full bg-white border-b border-gray-200 shadow-lg px-4 py-4 flex flex-col gap-4 z-50">
          <nav className="flex flex-col gap-3">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className={`text-base font-medium px-2 py-1 rounded-md transition-colors ${
                    isActive
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="h-px w-full bg-gray-200 my-1" />

          {profileName ? (
            <div className="flex flex-col gap-3">
              <Link
                href={profileHref}
                onClick={closeMenu}
                className="w-full text-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {profileName}
              </Link>
              <button
                onClick={() => {
                  closeMenu();
                  onLogoutAction();
                }}
                className="w-full text-center rounded-lg border border-yellow-500 bg-yellow-50 px-4 py-2 text-sm font-semibold text-yellow-700 hover:bg-yellow-100"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={closeMenu}
              className="w-full text-center rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
            >
              Login
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
