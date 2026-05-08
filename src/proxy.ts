import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Proxy — request interception layer (formerly "middleware").
 * Imports only authConfig (no Prisma) so the Node runtime stays clean.
 * Route protection logic lives in authConfig.callbacks.authorized.
 */
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: [
    "/admin/:path*",
    "/(protected)/:path*",
    "/userDashboard/:path*",
    "/onspot-registration/:path*",
    "/api/:path*",
  ],
};
