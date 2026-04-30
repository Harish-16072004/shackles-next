/**
 * /api/health
 *
 * Liveness + readiness probe for Docker, DigitalOcean App Platform,
 * and any load-balancer health-check that expects an HTTP 200.
 *
 * Returns 200 when the DB is reachable, 503 otherwise.
 * The response body is structured JSON so dashboards can parse it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic  = "force-dynamic"; // never cache this route

export async function GET() {
  const start = Date.now();

  let dbStatus: "ok" | "error" = "error";
  let dbMessage: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch (err) {
    dbMessage = err instanceof Error ? err.message : "unknown error";
  }

  const latencyMs = Date.now() - start;
  const httpStatus = dbStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status:    dbStatus === "ok" ? "healthy" : "degraded",
      checks: {
        db: {
          status: dbStatus,
          ...(dbMessage ? { message: dbMessage } : {}),
        },
      },
      latencyMs,
      timestamp: new Date().toISOString(),
      version:   process.env.npm_package_version ?? "unknown",
    },
    { status: httpStatus }
  );
}
