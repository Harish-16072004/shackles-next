import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Middleware — Edge-safe.
 * Imports only authConfig (no Prisma) so the Edge runtime stays clean.
 * Route protection logic lives in authConfig.callbacks.authorized.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: [
    "/admin/:path*",
    "/(protected)/:path*",
    "/userDashboard/:path*",
    "/onspot-registration/:path*",
    "/api/admin/:path*",
  ],
};
