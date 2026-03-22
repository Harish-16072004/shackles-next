import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveYear, getActiveYearShort } from "@/lib/edition";

const publicNavItems = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Workshops", href: "/workshops" },
  { label: "Team", href: "/team" },
  { label: "Contact", href: "/contact" },
];

export default async function Header() {
  const activeYear = getActiveYear();
  const activeYearShort = getActiveYearShort();
  const previousYearShort = String((activeYear - 1) % 100).padStart(2, "0");
  const session = await getSession();
  const sessionRole = typeof session?.role === "string" ? session.role : null;
  const sessionDisplayName =
    typeof (session as { displayName?: unknown } | null)?.displayName === "string"
      ? ((session as { displayName?: string }).displayName || null)
      : null;
  const navItems = session?.userId
    ? [
        ...publicNavItems.slice(0, 3),
        { label: "Accommodation", href: "/accommodation" },
        ...publicNavItems.slice(3),
      ]
    : publicNavItems;

  let profileName: string | null = sessionDisplayName;
  let profileHref = sessionRole === "ADMIN" ? "/admin/adminDashboard" : "/userDashboard";

  if (session?.userId && !profileName) {
    const user = await prisma.user.findUnique({
      where: { id: String(session.userId) },
      select: { firstName: true, lastName: true, role: true },
    });

    if (user) {
      profileName = `${user.firstName} ${user.lastName}`.trim();
      profileHref = user.role === "ADMIN" ? "/admin/adminDashboard" : "/userDashboard";
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-pink-600">
              SHACKLES {previousYearShort}-{activeYearShort}
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Auth Area */}
          {profileName ? (
            <div className="hidden md:flex items-center gap-3">
              <Link
                href={profileHref}
                className="rounded-full border-2 border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                {profileName}
              </Link>
              <form
                action={async () => {
                  "use server";
                  await deleteSession();
                  redirect("/");
                }}
              >
                <button
                  type="submit"
                  className="rounded-full border-2 border-yellow-500 px-4 py-1.5 text-sm font-semibold text-yellow-600 transition-colors hover:bg-yellow-500 hover:text-white"
                >
                  Logout
                </button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden md:inline-block rounded-full border-2 border-pink-600 px-4 py-1.5 text-sm font-semibold text-pink-600 transition-colors hover:bg-pink-600 hover:text-white"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
