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
      const userRole = auth?.user?.role as string | undefined;

      // --- 1. Public API routes ---
      if (pathname === "/api/health" || pathname.startsWith("/api/auth")) {
        return true;
      }

      // --- 2. Administrative Paths (API & UI) ---
      const isAdminRoute = pathname.startsWith("/admin");
      const isAdminApi = pathname.startsWith("/api/admin");

      if (isAdminRoute || isAdminApi) {
        if (!isLoggedIn) return false;

        // Higher-level roles (ADMIN, COORDINATOR, VOLUNTEER)
        const isStaff = userRole === "ADMIN" || userRole === "COORDINATOR" || userRole === "VOLUNTEER";
        if (!isStaff) return false;

        // Specific sub-paths for restricted staff access
        const isRestrictedStaffPath = 
          pathname.includes("/marking") || 
          pathname.includes("/scanner") || 
          pathname.includes("/event-registrations");

        if (isRestrictedStaffPath) {
          // Both Volunteers and Coordinators can access these specific modules
          return true;
        }

        // Only SuperAdmins can access everything else in /admin or /api/admin
        return userRole === "ADMIN";
      }

      // --- 3. Protected User Routes ---
      const isUserRoute = pathname.startsWith("/userDashboard") || pathname.startsWith("/(protected)");
      if (isUserRoute) {
        return isLoggedIn;
      }

      // --- 4. Other API routes ---
      if (pathname.startsWith("/api/")) {
        return isLoggedIn;
      }

      return true;
    },
  },
};
