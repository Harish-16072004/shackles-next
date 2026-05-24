/**
 * /api/health
 *
 * Liveness + readiness probe for Docker, DigitalOcean App Platform,
 * and any load-balancer health-check that expects an HTTP 200.
 *
 * Returns 200 when the DB is reachable, 503 otherwise.
 * Also checks Redis connectivity when configured.
 * The response body is structured JSON so dashboards can parse it.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic  = "force-dynamic"; // never cache this route

export async function GET() {
  const start = Date.now();

  // --- Database check ---
  let dbStatus: "ok" | "error" = "error";
  let dbMessage: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "ok";
  } catch (err) {
    dbMessage = err instanceof Error ? err.message : "unknown error";
  }

  // --- Redis check ---
  let redisStatus: "ok" | "error" | "not_configured" = "not_configured";
  let redisMessage: string | undefined;

  try {
    // Dynamic import to avoid crashing if Redis module is not available
    const redisModule = await import("@/lib/redis");
    const redis = redisModule.getRedis ? redisModule.getRedis() : (redisModule.redisConnection || null);

    if (redis && typeof redis.ping === "function") {
      await redis.ping();
      redisStatus = "ok";
    } else {
      redisStatus = "not_configured";
      redisMessage = "Redis client not available";
    }
  } catch (err) {
    redisStatus = "error";
    redisMessage = err instanceof Error ? err.message : "unknown error";
  }

  const latencyMs = Date.now() - start;
  const isHealthy = dbStatus === "ok" && redisStatus !== "error";
  const httpStatus = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status:    isHealthy ? "healthy" : "degraded",
      checks: {
        db: {
          status: dbStatus,
          ...(dbMessage ? { message: dbMessage } : {}),
        },
        redis: {
          status: redisStatus,
          ...(redisMessage ? { message: redisMessage } : {}),
        },
      },
      latencyMs,
      timestamp: new Date().toISOString(),
      version:   process.env.npm_package_version ?? "unknown",
    },
    { status: httpStatus }
  );
}
