import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js configuration — NO Prisma imports.
 * Used by src/middleware.ts so the Edge runtime never touches Node-only modules.
 * The full config (with PrismaAdapter, bcrypt, events) lives in src/auth.ts.
 *
 * Note: jwt and session callbacks MUST be defined here, not in auth.ts,
 * so the Edge runtime (proxy.ts) can map token.role to session.user.role during `authorized()`.
 */
export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET ?? process.env.SESSION_SECRET,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    /**
     * jwt callback — runs when a token is created or updated.
     * Stores id and role from the user object (available on first sign-in).
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    /**
     * session callback — shapes the session object exposed to the client.
     * Reads id and role from the JWT token.
     */
    async session({ session, token }) {
      if (session.user) {
        if (token.id) {
          session.user.id = token.id;
        }
        if (token.role) {
          session.user.role = token.role;
        }
      }
      return session;
    },
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

      // Other API routes require authentication
      if (pathname.startsWith("/api/")) {
        return isLoggedIn;
      }

      // Admin page routes require ADMIN role
      if (pathname.startsWith("/admin")) {
        if (!isLoggedIn) return false;

        // Coordinators and Volunteers need access to specific admin routes like marking or scanner
        if (pathname.startsWith("/admin/marking") || pathname.startsWith("/admin/scanner")) {
          return (
            auth.user?.role === "ADMIN" ||
            auth.user?.role === "COORDINATOR" ||
            auth.user?.role === "VOLUNTEER"
          );
        }

        return auth.user?.role === "ADMIN";
      }

      // User dashboard requires authentication
      if (pathname.startsWith("/userDashboard")) {
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
