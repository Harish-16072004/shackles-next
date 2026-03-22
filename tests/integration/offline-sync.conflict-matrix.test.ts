import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/scanner-auth.service", () => ({
  requireScannerActor: vi.fn(async () => ({
    ok: true,
    actor: { id: "phase4-offline-scanner", role: "COORDINATOR" },
  })),
}));

import { POST } from "../../src/app/api/offline/operations/sync/route";

const prisma = new PrismaClient();

function randomTag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createUser(runTag: string, index: number, options?: { verified?: boolean; shackles?: boolean }) {
  const verified = options?.verified ?? true;
  const withShackles = options?.shackles ?? true;

  const user = await prisma.user.create({
    data: {
      firstName: `Offline${index}`,
      lastName: "Matrix",
      email: `${runTag}.${index}@example.test`,
      phone: `70000${String(index).padStart(5, "0")}`,
      password: "phase4-offline",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      ...(withShackles ? { shacklesId: `${runTag.toUpperCase().slice(0, 10)}${String(index).padStart(3, "0")}` } : {}),
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `${runTag}-tx-${index}`,
      proofUrl: `${runTag}-proof-${index}`,
      status: verified ? "VERIFIED" : "PENDING",
    },
  });

  return user;
}

async function postOperations(operations: unknown[]) {
  const request = new Request("http://localhost/api/offline/operations/sync", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": randomTag("phase4-offline-request"),
    },
    body: JSON.stringify({ operations }),
  });

  const response = await POST(request);
  const payload = await response.json();
  return {
    status: response.status,
    payload,
  };
}

describe("integration: offline sync replay and conflict matrix", () => {
  const runTag = randomTag("phase4-offline");

  afterAll(async () => {
    await prisma.registrationOperation.deleteMany({
      where: { operationId: { startsWith: `${runTag}-op-` } },
    });

    await prisma.eventRegistration.deleteMany({
      where: { stationId: { startsWith: `${runTag}-station-` } },
    });

    await prisma.team.deleteMany({
      where: { name: { startsWith: `PHASE4-OFFLINE-TEAM-${runTag}` } },
    });

    await prisma.event.deleteMany({
      where: {
        OR: [
          { name: { startsWith: `PHASE4-OFFLINE-IND-${runTag}` } },
          { name: { startsWith: `PHASE4-OFFLINE-TEAM-${runTag}` } },
        ],
      },
    });

    await prisma.payment.deleteMany({ where: { transactionId: { startsWith: `${runTag}-tx-` } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${runTag}.` } } });
    await prisma.$disconnect();
  });

  it("maps QUICK_REGISTER, TEAM_ADD, TEAM_COMPLETE, ATTENDANCE to expected status matrix", async () => {
    const individualEvent = await prisma.event.create({
      data: {
        name: `PHASE4-OFFLINE-IND-${runTag}`,
        type: "TECHNICAL",
        participationMode: "INDIVIDUAL",
        isActive: true,
        maxParticipants: 100,
        maxTeams: 100,
        date: new Date(),
      },
    });

    const teamEvent = await prisma.event.create({
      data: {
        name: `PHASE4-OFFLINE-TEAM-${runTag}`,
        type: "TECHNICAL",
        participationMode: "TEAM",
        teamMinSize: 2,
        teamMaxSize: 4,
        isActive: true,
        maxParticipants: 100,
        maxTeams: 100,
        date: new Date(),
      },
    });

    const quickUser = await createUser(runTag, 1, { verified: true });
    const unpaidUser = await createUser(runTag, 2, { verified: false });
    const leaderUser = await createUser(runTag, 3, { verified: true, shackles: true });
    const memberUser = await createUser(runTag, 4, { verified: true, shackles: true });

    const leaderShacklesId = leaderUser.shacklesId;
    const memberShacklesId = memberUser.shacklesId;

    expect(leaderShacklesId).toBeTruthy();
    expect(memberShacklesId).toBeTruthy();

    const operations = [
      {
        operationId: `${runTag}-op-quick-success`,
        stationId: `${runTag}-station-a`,
        type: "QUICK_REGISTER",
        participantId: quickUser.id,
        eventName: individualEvent.name,
      },
      {
        operationId: `${runTag}-op-quick-conflict`,
        stationId: `${runTag}-station-a`,
        type: "QUICK_REGISTER",
        participantId: unpaidUser.id,
        eventName: individualEvent.name,
      },
      {
        operationId: `${runTag}-op-team-add-conflict`,
        stationId: `${runTag}-station-a`,
        type: "TEAM_ADD",
        participantId: unpaidUser.id,
        eventName: teamEvent.name,
        teamName: `PHASE4-OFFLINE-TEAM-${runTag}-A`,
      },
      {
        operationId: `${runTag}-op-team-complete-failed`,
        stationId: `${runTag}-station-a`,
        type: "TEAM_COMPLETE",
        eventName: teamEvent.name,
        teamName: `PHASE4-OFFLINE-TEAM-${runTag}-B`,
        payload: {
          shacklesIds: [leaderShacklesId],
        },
      },
      {
        operationId: `${runTag}-op-team-complete-success`,
        stationId: `${runTag}-station-a`,
        type: "TEAM_COMPLETE",
        eventName: teamEvent.name,
        teamName: `PHASE4-OFFLINE-TEAM-${runTag}-C`,
        payload: {
          shacklesIds: [leaderShacklesId, memberShacklesId],
          leaderShacklesId,
        },
      },
      {
        operationId: `${runTag}-op-attendance-conflict`,
        stationId: `${runTag}-station-a`,
        type: "ATTENDANCE",
        participantId: unpaidUser.id,
        eventName: individualEvent.name,
      },
      {
        operationId: `${runTag}-op-attendance-applied`,
        stationId: `${runTag}-station-a`,
        type: "ATTENDANCE",
        participantId: quickUser.id,
        eventName: individualEvent.name,
      },
    ];

    const response = await postOperations(operations);
    expect(response.status).toBe(200);

    const resultById = new Map(
      (response.payload.results as Array<Record<string, string>>).map((entry) => [entry.operationId, entry])
    );

    expect(resultById.get(`${runTag}-op-quick-success`)?.status).toBe("APPLIED");

    expect(resultById.get(`${runTag}-op-quick-conflict`)?.status).toBe("CONFLICT");
    expect(resultById.get(`${runTag}-op-quick-conflict`)?.reason).toBe("PAYMENT_NOT_VERIFIED");

    expect(resultById.get(`${runTag}-op-team-add-conflict`)?.status).toBe("CONFLICT");
    expect(resultById.get(`${runTag}-op-team-add-conflict`)?.reason).toBe("PAYMENT_NOT_VERIFIED");

    expect(resultById.get(`${runTag}-op-team-complete-failed`)?.status).toBe("FAILED");
    expect(resultById.get(`${runTag}-op-team-complete-failed`)?.reason).toBe("MISSING_BULK_TEAM_INPUT");

    expect(resultById.get(`${runTag}-op-team-complete-success`)?.status).toBe("APPLIED");

    expect(resultById.get(`${runTag}-op-attendance-conflict`)?.status).toBe("CONFLICT");
    expect(resultById.get(`${runTag}-op-attendance-conflict`)?.reason).toBe("NOT_REGISTERED");

    expect(resultById.get(`${runTag}-op-attendance-applied`)?.status).toBe("APPLIED");

    const operationRows = await prisma.registrationOperation.findMany({
      where: { operationId: { startsWith: `${runTag}-op-` } },
      select: { operationId: true, status: true },
    });

    const rowById = new Map(operationRows.map((row) => [row.operationId, row.status]));
    expect(rowById.get(`${runTag}-op-quick-success`)).toBe("APPLIED");
    expect(rowById.get(`${runTag}-op-quick-conflict`)).toBe("CONFLICT");
    expect(rowById.get(`${runTag}-op-team-complete-failed`)).toBe("FAILED");
  }, 30000);

  it("deduplicates replay by operationId and returns already-applied status", async () => {
    const individualEvent = await prisma.event.findFirstOrThrow({
      where: { name: `PHASE4-OFFLINE-IND-${runTag}` },
    });

    const replayUser = await createUser(runTag, 10, { verified: true });
    const operationId = `${runTag}-op-replay-quick`;

    const first = await postOperations([
      {
        operationId,
        stationId: `${runTag}-station-replay`,
        type: "QUICK_REGISTER",
        participantId: replayUser.id,
        eventName: individualEvent.name,
      },
    ]);

    expect(first.status).toBe(200);
    expect(first.payload.results[0].status).toBe("APPLIED");

    const second = await postOperations([
      {
        operationId,
        stationId: `${runTag}-station-replay`,
        type: "QUICK_REGISTER",
        participantId: replayUser.id,
        eventName: individualEvent.name,
      },
    ]);

    expect(second.status).toBe(200);
    expect(second.payload.results[0].status).toBe("APPLIED");
    expect(second.payload.results[0].message).toBe("Already applied");

    const opRows = await prisma.registrationOperation.findMany({
      where: { operationId },
    });

    expect(opRows).toHaveLength(1);

    const regs = await prisma.eventRegistration.findMany({
      where: {
        stationId: `${runTag}-station-replay`,
        userId: replayUser.id,
        eventId: individualEvent.id,
      },
    });

    expect(regs).toHaveLength(1);
  }, 30000);
});
