import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration — NO Prisma imports.
 * Used by src/middleware.ts so the Edge runtime never touches Node-only modules.
 * The full config (with PrismaAdapter, bcrypt, events) lives in src/auth.ts.
 *
 * L1: jwt/session callbacks removed — they are defined in auth.ts only.
 * Only the `authorized` callback remains here for middleware route protection.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.SESSION_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // --- Public API routes that don't require auth ---
      if (
        pathname === "/api/health" ||
        pathname.startsWith("/api/auth")
      ) {
        return true;
      }

      // API admin routes require ADMIN role
      if (pathname.startsWith("/api/admin")) {
        if (!isLoggedIn) return false;
        return auth.user?.role === "ADMIN";
      }

      // Scanner API routes require auth (handler-level checks role/permissions)
      if (pathname.startsWith("/api/scanner")) {
        return isLoggedIn;
      }

      // Other API routes require authentication
      if (pathname.startsWith("/api/")) {
        return isLoggedIn;
      }

      // Admin page routes require ADMIN role
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false;
        return auth.user?.role === "ADMIN";
      }

      // User dashboard and on-spot registration require authentication
      if (pathname.startsWith("/userDashboard") || pathname.startsWith("/onspot-registration")) {
        return isLoggedIn;
      }

      // Protected routes require any authenticated session
      if (pathname.startsWith("/(protected)")) {
        return isLoggedIn;
      }

      return true;
    },
  },
};
