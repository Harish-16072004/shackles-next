import { NextResponse } from "next/server";
import {
  RegistrationOperationType,
  RegistrationSyncStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createError } from "@/lib/error-contract";
import { resolveRequestId, safeLogError, safeLogInfo } from "@/lib/safe-log";
import { requireScannerActor } from "@/server/services/scanner-auth.service";
import { applyAttendanceMark } from "@/server/services/attendance.service";
import { quickRegisterAndMarkAttendance } from "@/server/services/event-registration.service";
import { runSerializableTransaction } from "@/server/services/transaction.service";
import {
  addMemberToTeamEvent,
  bulkRegisterAndLockTeamByShacklesIds,
  completeExistingTeamRegistration,
  normalizeShacklesId,
  parseUniqueShacklesIds,
} from "@/server/services/team-registration.service";

type SyncOperationInput = {
  operationId: string;
  stationId: string;
  type: "KIT" | "ATTENDANCE" | "QUICK_REGISTER" | "TEAM_ADD" | "TEAM_COMPLETE";
  participantId?: string;
  eventName?: string;
  teamName?: string;
  teamLeaderUserId?: string;
  payload?: unknown;
};

type SyncResult = {
  operationId: string;
  status: "APPLIED" | "CONFLICT" | "FAILED";
  code?: string;
  reason?: string;
  message?: string;
  details?: Record<string, unknown>;
};

async function getScannerActor() {
  const auth = await requireScannerActor();
  if (!auth.ok) return null;
  return auth.actor;
}

function conflict(reason: string, message: string, details?: Record<string, unknown>) {
  return {
    status: "CONFLICT" as const,
    code: "CONFLICT",
    reason,
    message,
    ...(details ? { details } : {}),
  };
}

function failed(reason: string, message: string, details?: Record<string, unknown>) {
  return {
    status: "FAILED" as const,
    code: "INVALID_INPUT",
    reason,
    message,
    ...(details ? { details } : {}),
  };
}

function applied(message: string, details?: Record<string, unknown>) {
  return {
    status: "APPLIED" as const,
    code: "APPLIED",
    message,
    ...(details ? { details } : {}),
  };
}

async function applyOperation(op: SyncOperationInput): Promise<Omit<SyncResult, "operationId">> {
  switch (op.type) {
    case "KIT": {
      if (!op.participantId) return failed("MISSING_PARTICIPANT", "Participant is required for kit issuance.");
      await prisma.user.update({
        where: { id: op.participantId },
        data: { kitStatus: "ISSUED", kitIssuedAt: new Date() },
      });
      return applied("Kit issued.");
    }

    case "ATTENDANCE": {
      if (!op.participantId || !op.eventName) {
        return failed("MISSING_INPUT", "participantId and eventName are required.");
      }

      const attendanceResult = await applyAttendanceMark({
        db: prisma,
        userId: op.participantId,
        eventName: op.eventName,
      });

      if (attendanceResult.status === "EVENT_NOT_FOUND") {
        return conflict("EVENT_NOT_FOUND", attendanceResult.message);
      }

      if (attendanceResult.status === "NOT_REGISTERED") {
        return conflict("NOT_REGISTERED", attendanceResult.message);
      }

      if (attendanceResult.status === "TEAM_NOT_COMPLETED") {
        return conflict("TEAM_NOT_COMPLETED", attendanceResult.message);
      }

      if (attendanceResult.status === "ALREADY_ATTENDED") {
        return applied(attendanceResult.message);
      }

      return applied(attendanceResult.message);
    }

    case "QUICK_REGISTER": {
      if (!op.participantId || !op.eventName) {
        return failed("MISSING_INPUT", "participantId and eventName are required.");
      }

      const participantId = op.participantId;
      const eventName = op.eventName;

      const result = await runSerializableTransaction(prisma, (tx) =>
        quickRegisterAndMarkAttendance({
          db: tx,
          userId: participantId,
          eventName,
          stationId: op.stationId,
          clientOperationId: op.operationId,
          syncedAt: new Date(),
          teamEventMessage: "Team events require team flow.",
          successMessage: "Quick registration applied.",
        })
      );

      if (result.success) {
        return applied(result.message);
      }

      if (result.reason === "INVALID_INPUT") {
        return failed(result.reason, result.error, result.details);
      }

      return conflict(result.reason, result.error, result.details);
    }

    case "TEAM_ADD": {
      if (!op.participantId || !op.eventName || !op.teamName?.trim()) {
        return failed("MISSING_INPUT", "participantId, eventName and teamName are required.");
      }

      const participantId = op.participantId;
      const eventName = op.eventName;
      const teamName = op.teamName;

      const result = await runSerializableTransaction(prisma, (tx) =>
        addMemberToTeamEvent({
          db: tx,
          userId: participantId,
          eventName,
          teamName,
          stationId: op.stationId,
          clientOperationId: op.operationId,
          syncedAt: new Date(),
        })
      );

      if (result.success) {
        return applied(result.message);
      }

      if (result.reason === "INVALID_INPUT") {
        return failed(result.reason, result.error, result.details);
      }

      return conflict(result.reason, result.error, result.details);
    }

    case "TEAM_COMPLETE": {
      if (!op.eventName || !op.teamName?.trim()) {
        return failed("MISSING_INPUT", "eventName and teamName are required.");
      }

      const eventName = op.eventName;
      const teamName = op.teamName;

      const payloadRecord = op.payload && typeof op.payload === "object"
        ? (op.payload as Record<string, unknown>)
        : null;

      const payloadShacklesIds = Array.isArray(payloadRecord?.shacklesIds)
        ? parseUniqueShacklesIds(
            payloadRecord.shacklesIds.filter((value): value is string => typeof value === "string")
          )
        : [];

      const payloadLeaderShacklesId = typeof payloadRecord?.leaderShacklesId === "string"
        ? normalizeShacklesId(payloadRecord.leaderShacklesId)
        : "";

      if (payloadShacklesIds.length > 0 || payloadLeaderShacklesId) {
        if (payloadShacklesIds.length === 0 || !payloadLeaderShacklesId) {
          return failed("MISSING_BULK_TEAM_INPUT", "Both shacklesIds and leaderShacklesId are required.");
        }

        const bulkResult = await runSerializableTransaction(prisma, (tx) =>
          bulkRegisterAndLockTeamByShacklesIds({
            db: tx,
            eventName,
            teamName,
            shacklesIds: payloadShacklesIds,
            leaderShacklesId: payloadLeaderShacklesId,
            stationId: op.stationId,
            operationId: op.operationId,
            syncedAt: new Date(),
          })
        );

        if (bulkResult.success) {
          return applied(bulkResult.message);
        }

        if (bulkResult.reason === "INVALID_INPUT") {
          return failed(bulkResult.reason, bulkResult.error, bulkResult.details);
        }

        return conflict(bulkResult.reason, bulkResult.error, bulkResult.details);
      }

      const completeResult = await runSerializableTransaction(prisma, (tx) =>
        completeExistingTeamRegistration({
          db: tx,
          eventName,
          teamName,
          leaderUserId: op.teamLeaderUserId,
        })
      );

      if (completeResult.success) {
        return applied(completeResult.message);
      }

      if (completeResult.reason === "INVALID_INPUT") {
        return failed(completeResult.reason, completeResult.error, completeResult.details);
      }

      return conflict(completeResult.reason, completeResult.error, completeResult.details);
    }

    default:
      return failed("UNSUPPORTED_OPERATION", "Operation type is not supported.");
  }
}

export async function POST(request: Request) {
  const batchStartedAt = Date.now();
  const requestId = resolveRequestId(request.headers.get("x-request-id"));
  const actor = await getScannerActor();
  if (!actor) {
    return NextResponse.json({ error: createError("NOT_AUTHENTICATED", "Unauthorized") }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const operations = Array.isArray(body?.operations) ? (body.operations as SyncOperationInput[]) : [];

  if (operations.length === 0) {
    return NextResponse.json({ error: createError("INVALID_INPUT", "operations[] is required") }, { status: 400 });
  }

  safeLogInfo("[offline.sync]", "Starting sync batch", {
    requestId,
    scannerUserId: actor.id,
    operationCount: operations.length,
  });

  const results: SyncResult[] = [];

  for (const operation of operations) {
    const operationStartedAt = Date.now();

    if (!operation?.operationId || !operation?.stationId || !operation?.type) {
      results.push({
        operationId: operation?.operationId || "unknown",
        status: "FAILED",
        code: "INVALID_INPUT",
        reason: "INVALID_OPERATION",
        message: "operationId, stationId and type are required.",
      });

      safeLogInfo("[offline.sync]", "Completed operation", {
        requestId,
        operationType: operation?.type || null,
        operationId: operation?.operationId || "unknown",
        scannerUserId: actor.id,
        status: "FAILED",
        durationMs: Date.now() - operationStartedAt,
      });
      continue;
    }

    safeLogInfo("[offline.sync]", "Processing operation", {
      requestId,
      operationType: operation.type,
      operationId: operation.operationId,
      eventName: operation.eventName || null,
      scannerUserId: actor.id,
      participantId: operation.participantId || null,
    });

    const existing = await prisma.registrationOperation.findUnique({
      where: { operationId: operation.operationId },
      select: { status: true, conflictReason: true, errorMessage: true },
    });

    if (existing) {
      const status = existing.status === RegistrationSyncStatus.PENDING
        ? "FAILED"
        : (existing.status as SyncResult["status"]);

      const replayResult = {
        operationId: operation.operationId,
        status,
        code: status === "APPLIED" ? "APPLIED" : "CONFLICT",
        reason: existing.conflictReason || existing.errorMessage || undefined,
        message: existing.status === RegistrationSyncStatus.APPLIED ? "Already applied" : existing.errorMessage || undefined,
      };

      results.push(replayResult);

      safeLogInfo("[offline.sync]", "Completed operation", {
        requestId,
        operationType: operation.type,
        operationId: operation.operationId,
        scannerUserId: actor.id,
        status: replayResult.status,
        durationMs: Date.now() - operationStartedAt,
        replayed: true,
      });
      continue;
    }

    await prisma.registrationOperation.create({
      data: {
        operationId: operation.operationId,
        stationId: operation.stationId,
        operationType: operation.type as RegistrationOperationType,
        actorUserId: actor.id,
        participantId: operation.participantId || null,
        eventName: operation.eventName || null,
        teamName: operation.teamName || null,
        teamLeaderUserId: operation.teamLeaderUserId || null,
        payload: operation.payload ? (operation.payload as object) : undefined,
      },
    });

    try {
      const applyResult = await applyOperation(operation);

      await prisma.registrationOperation.update({
        where: { operationId: operation.operationId },
        data: {
          status: applyResult.status as RegistrationSyncStatus,
          conflictReason: applyResult.status === "CONFLICT" ? applyResult.reason || "CONFLICT" : null,
          errorMessage: applyResult.status === "FAILED" ? applyResult.reason || "FAILED" : null,
          processedAt: new Date(),
        },
      });

      results.push({
        operationId: operation.operationId,
        ...applyResult,
      });

      safeLogInfo("[offline.sync]", "Completed operation", {
        requestId,
        operationType: operation.type,
        operationId: operation.operationId,
        scannerUserId: actor.id,
        status: applyResult.status,
        durationMs: Date.now() - operationStartedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNC_ERROR";
      safeLogError("[offline.sync]", error, {
        requestId,
        operationType: operation.type,
        operationId: operation.operationId,
        eventName: operation.eventName || null,
        scannerUserId: actor.id,
        participantId: operation.participantId || null,
      });
      await prisma.registrationOperation.update({
        where: { operationId: operation.operationId },
        data: {
          status: RegistrationSyncStatus.FAILED,
          errorMessage: message,
          processedAt: new Date(),
        },
      });

      results.push({
        operationId: operation.operationId,
        status: "FAILED",
        code: "INTERNAL_ERROR",
        reason: message,
        message: "Unable to process operation.",
      });

      safeLogInfo("[offline.sync]", "Completed operation", {
        requestId,
        operationType: operation.type,
        operationId: operation.operationId,
        scannerUserId: actor.id,
        status: "FAILED",
        durationMs: Date.now() - operationStartedAt,
      });
    }
  }

  const appliedCount = results.filter((result) => result.status === "APPLIED").length;
  const conflictCount = results.filter((result) => result.status === "CONFLICT").length;
  const failedCount = results.filter((result) => result.status === "FAILED").length;

  safeLogInfo("[offline.sync]", "Completed sync batch", {
    requestId,
    scannerUserId: actor.id,
    operationCount: operations.length,
    appliedCount,
    conflictCount,
    failedCount,
    durationMs: Date.now() - batchStartedAt,
  });

  return NextResponse.json({ results }, { status: 200 });
}
