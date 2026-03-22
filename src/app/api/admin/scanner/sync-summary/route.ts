import { NextResponse } from "next/server";
import { RegistrationSyncStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createError } from "@/lib/error-contract";
import { resolveRequestId, safeLogError, safeLogInfo } from "@/lib/safe-log";
import { requireScannerActor } from "@/server/services/scanner-auth.service";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request.headers.get("x-request-id"));

  try {
    const auth = await requireScannerActor();
    if (!auth.ok) {
      const status = auth.reason === "NOT_AUTHENTICATED" ? 401 : 403;
      return NextResponse.json({ error: createError(auth.reason, auth.message) }, { status });
    }
    const actor = auth.actor;

    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [applied24h, conflict24h, failed24h, applied7d, conflict7d, failed7d, topConflictReasons] = await Promise.all([
      prisma.registrationOperation.count({ where: { createdAt: { gte: since24h }, status: RegistrationSyncStatus.APPLIED } }),
      prisma.registrationOperation.count({ where: { createdAt: { gte: since24h }, status: RegistrationSyncStatus.CONFLICT } }),
      prisma.registrationOperation.count({ where: { createdAt: { gte: since24h }, status: RegistrationSyncStatus.FAILED } }),
      prisma.registrationOperation.count({ where: { createdAt: { gte: since7d }, status: RegistrationSyncStatus.APPLIED } }),
      prisma.registrationOperation.count({ where: { createdAt: { gte: since7d }, status: RegistrationSyncStatus.CONFLICT } }),
      prisma.registrationOperation.count({ where: { createdAt: { gte: since7d }, status: RegistrationSyncStatus.FAILED } }),
      prisma.registrationOperation.groupBy({
        by: ["conflictReason"],
        where: {
          createdAt: { gte: since7d },
          status: RegistrationSyncStatus.CONFLICT,
          conflictReason: { not: null },
        },
        _count: { conflictReason: true },
        orderBy: {
          _count: {
            conflictReason: "desc",
          },
        },
        take: 5,
      }),
    ]);

    const total24h = applied24h + conflict24h + failed24h;
    const total7d = applied7d + conflict7d + failed7d;

    const successRate24h = total24h > 0 ? Number(((applied24h / total24h) * 100).toFixed(1)) : 100;
    const successRate7d = total7d > 0 ? Number(((applied7d / total7d) * 100).toFixed(1)) : 100;

    safeLogInfo("[admin.scanner.sync-summary]", "Generated sync summary", {
      requestId,
      scannerUserId: actor.id,
      total24h,
      total7d,
      conflict24h,
      conflict7d,
      failed24h,
      failed7d,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      data: {
        window24h: {
          applied: applied24h,
          conflicts: conflict24h,
          failures: failed24h,
          replaySuccessRate: successRate24h,
        },
        window7d: {
          applied: applied7d,
          conflicts: conflict7d,
          failures: failed7d,
          replaySuccessRate: successRate7d,
        },
        topConflictReasons: topConflictReasons.map((item) => ({
          reason: item.conflictReason || "UNKNOWN",
          count: item._count.conflictReason,
        })),
      },
    });
  } catch (error) {
    safeLogError("[admin.scanner.sync-summary]", error, {
      requestId,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { error: createError("INTERNAL_ERROR", "Unable to fetch sync summary") },
      { status: 500 }
    );
  }
}
