import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration — NO Prisma imports.
 * Used by src/middleware.ts so the Edge runtime never touches Node-only modules.
 * The full config (with PrismaAdapter, bcrypt, events) lives in src/auth.ts.
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

      // Admin routes require ADMIN role
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false;
        const user = auth?.user as any;
        return user?.role === "ADMIN";
      }

      // Protected routes require any authenticated session
      if (pathname.startsWith("/(protected)")) {
        return isLoggedIn;
      }

      return true;
    },
  },
};
