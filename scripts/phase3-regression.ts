import { Prisma, PrismaClient, EventParticipationMode, RegistrationOperationType, RegistrationSyncStatus, TeamStatus } from "@prisma/client";
import { bulkRegisterAndLockTeamByShacklesIds } from "../src/server/services/team-registration.service";
import { runSerializableTransaction } from "../src/server/services/transaction.service";

type TeamServiceResult = Awaited<ReturnType<typeof bulkRegisterAndLockTeamByShacklesIds>>;

const prisma = new PrismaClient();

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function randomToken(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createVerifiedUser(runTag: string, index: number) {
  const suffix = `${runTag}-${index}`;

  const user = await prisma.user.create({
    data: {
      firstName: `Phase3${index}`,
      lastName: "Regression",
      email: `phase3.${suffix}@example.test`,
      phone: `90000${String(index).padStart(5, "0")}`,
      password: "phase3-regression",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: `PH3${Date.now()}${String(index).padStart(3, "0")}`,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `phase3-tx-${suffix}`,
      proofUrl: `phase3-proof-${suffix}`,
      status: "VERIFIED",
    },
  });

  return user;
}

async function createTeamEvent(eventName: string) {
  return prisma.event.create({
    data: {
      name: eventName,
      type: "TECHNICAL",
      participationMode: EventParticipationMode.TEAM,
      teamMinSize: 2,
      teamMaxSize: 4,
      maxTeams: 10,
      maxParticipants: 100,
      isActive: true,
      date: new Date(),
    },
  });
}

async function runConcurrentTeamLockRegression(runTag: string) {
  const eventName = `PHASE3-CONC-${runTag}`;
  const teamName = `PHASE3 TEAM ${runTag}`;
  const operationA = `phase3-concurrent-op-a-${runTag}`;
  const operationB = `phase3-concurrent-op-b-${runTag}`;

  const event = await createTeamEvent(eventName);
  const users = await Promise.all([
    createVerifiedUser(runTag, 1),
    createVerifiedUser(runTag, 2),
    createVerifiedUser(runTag, 3),
  ]);

  const shacklesIds = users
    .map((user) => user.shacklesId)
    .filter((value): value is string => Boolean(value));

  assertCondition(shacklesIds.length === 3, "Failed to prepare Shackles IDs for concurrent test");

  const [resultA, resultB] = await Promise.allSettled([
    runSerializableTransaction(prisma, (tx) =>
      bulkRegisterAndLockTeamByShacklesIds({
        db: tx,
        eventName,
        teamName,
        shacklesIds,
        leaderShacklesId: shacklesIds[0],
        stationId: "phase3-concurrency-a",
        operationId: operationA,
      })
    ),
    runSerializableTransaction(prisma, (tx) =>
      bulkRegisterAndLockTeamByShacklesIds({
        db: tx,
        eventName,
        teamName,
        shacklesIds,
        leaderShacklesId: shacklesIds[0],
        stationId: "phase3-concurrency-b",
        operationId: operationB,
      })
    ),
  ]);

  const fulfilled: TeamServiceResult[] = [resultA, resultB]
    .filter((entry): entry is PromiseFulfilledResult<TeamServiceResult> => entry.status === "fulfilled")
    .map((entry) => entry.value);
  const rejected = [resultA, resultB].filter(
    (entry): entry is PromiseRejectedResult => entry.status === "rejected"
  );

  const successCount = fulfilled.filter((entry) => entry.success).length;
  assertCondition(successCount === 1, `Expected exactly one successful concurrent lock, got ${successCount}`);

  for (const failure of fulfilled.filter((entry) => !entry.success)) {
    assertCondition(
      ["ALREADY_REGISTERED", "TEAM_LOCKED"].includes(failure.reason),
      `Unexpected concurrent failure reason: ${failure.reason}`
    );
  }

  for (const rejection of rejected) {
    assertCondition(
      isUniqueConstraintError(rejection.reason),
      `Unexpected concurrent rejection: ${String(rejection.reason)}`
    );
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: event.id },
    select: { userId: true },
  });

  assertCondition(registrations.length === shacklesIds.length, "Concurrent flow produced incorrect registration count");
  assertCondition(
    new Set(registrations.map((entry) => entry.userId)).size === shacklesIds.length,
    "Concurrent flow produced duplicate participant registrations"
  );

  const normalizedTeamName = teamName.trim().replace(/\s+/g, " ").toUpperCase();
  const team = await prisma.team.findUnique({
    where: {
      eventId_nameNormalized: {
        eventId: event.id,
        nameNormalized: normalizedTeamName,
      },
    },
  });

  assertCondition(team, "Team record missing after concurrent lock attempt");
  assertCondition(team.status === TeamStatus.LOCKED, "Team should be locked after successful registration");
  assertCondition(team.memberCount === shacklesIds.length, "Team memberCount mismatch after concurrent lock");
}

async function runReplayIdempotencyRegression(runTag: string) {
  const eventName = `PHASE3-REPLAY-${runTag}`;
  const teamName = `PHASE3 REPLAY TEAM ${runTag}`;
  const replayOperationId = `phase3-replay-op-${runTag}`;

  const event = await createTeamEvent(eventName);
  const users = await Promise.all([createVerifiedUser(runTag, 11), createVerifiedUser(runTag, 12)]);

  const shacklesIds = users
    .map((user) => user.shacklesId)
    .filter((value): value is string => Boolean(value));

  assertCondition(shacklesIds.length === 2, "Failed to prepare Shackles IDs for replay test");

  const first = await runSerializableTransaction(prisma, (tx) =>
    bulkRegisterAndLockTeamByShacklesIds({
      db: tx,
      eventName,
      teamName,
      shacklesIds,
      leaderShacklesId: shacklesIds[0],
      stationId: "phase3-replay",
      operationId: replayOperationId,
    })
  );

  if (!first.success) {
    throw new Error(`Initial replay baseline call failed: ${first.error}`);
  }

  const second = await runSerializableTransaction(prisma, (tx) =>
    bulkRegisterAndLockTeamByShacklesIds({
      db: tx,
      eventName,
      teamName,
      shacklesIds,
      leaderShacklesId: shacklesIds[0],
      stationId: "phase3-replay",
      operationId: replayOperationId,
    })
  );

  assertCondition(!second.success, "Replay of same TEAM_COMPLETE operation unexpectedly succeeded");
  assertCondition(
    ["ALREADY_REGISTERED", "TEAM_LOCKED"].includes(second.reason),
    `Unexpected replay idempotency reason: ${second.reason}`
  );

  const rows = await prisma.eventRegistration.findMany({
    where: {
      eventId: event.id,
      clientOperationId: {
        startsWith: `${replayOperationId}:`,
      },
    },
    select: {
      userId: true,
      clientOperationId: true,
    },
  });

  assertCondition(rows.length === shacklesIds.length, "Replay flow produced unexpected idempotency key count");
  assertCondition(
    new Set(rows.map((row) => row.clientOperationId)).size === shacklesIds.length,
    "Replay flow produced duplicate idempotency keys"
  );

  await prisma.registrationOperation.create({
    data: {
      operationId: `phase3-ledger-${runTag}`,
      stationId: "phase3-replay",
      operationType: RegistrationOperationType.TEAM_COMPLETE,
      status: RegistrationSyncStatus.APPLIED,
      payload: { scenario: "phase3-regression" },
      processedAt: new Date(),
    },
  });

  let duplicateInsertBlocked = false;
  try {
    await prisma.registrationOperation.create({
      data: {
        operationId: `phase3-ledger-${runTag}`,
        stationId: "phase3-replay",
        operationType: RegistrationOperationType.TEAM_COMPLETE,
        status: RegistrationSyncStatus.APPLIED,
        payload: { scenario: "phase3-regression-duplicate" },
        processedAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      duplicateInsertBlocked = true;
    } else {
      throw error;
    }
  }

  assertCondition(duplicateInsertBlocked, "RegistrationOperation operationId unique constraint did not block duplicate replay");
}

async function cleanup(runTag: string) {
  await prisma.registrationOperation.deleteMany({
    where: {
      OR: [
        { operationId: { startsWith: `phase3-concurrent-op-a-${runTag}` } },
        { operationId: { startsWith: `phase3-concurrent-op-b-${runTag}` } },
        { operationId: { startsWith: `phase3-replay-op-${runTag}` } },
        { operationId: { startsWith: `phase3-ledger-${runTag}` } },
      ],
    },
  });

  await prisma.eventRegistration.deleteMany({
    where: {
      OR: [
        { stationId: "phase3-concurrency-a" },
        { stationId: "phase3-concurrency-b" },
        { stationId: "phase3-replay" },
      ],
    },
  });

  await prisma.team.deleteMany({
    where: {
      OR: [
        { name: { startsWith: "PHASE3 TEAM " } },
        { name: { startsWith: "PHASE3 REPLAY TEAM " } },
      ],
    },
  });

  await prisma.event.deleteMany({
    where: {
      OR: [{ name: { startsWith: "PHASE3-CONC-" } }, { name: { startsWith: "PHASE3-REPLAY-" } }],
    },
  });

  await prisma.payment.deleteMany({
    where: {
      transactionId: { startsWith: `phase3-tx-${runTag}` },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: { startsWith: `phase3.${runTag}-` },
    },
  });
}

async function main() {
  const runTag = randomToken("phase3");

  try {
    await runConcurrentTeamLockRegression(runTag);
    await runReplayIdempotencyRegression(runTag);
    console.log("Phase 3 regression tests passed.");
  } finally {
    await cleanup(runTag);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Phase 3 regression tests failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
