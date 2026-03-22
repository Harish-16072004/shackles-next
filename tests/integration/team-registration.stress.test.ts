import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import {
  addMemberToTeamEvent,
  bulkRegisterAndLockTeamByShacklesIds,
  TeamServiceResult,
} from "../../src/server/services/team-registration.service";
import { runSerializableTransaction } from "../../src/server/services/transaction.service";

const prisma = new PrismaClient();
const runTag = `phase4-stress-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function isUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isKnownConcurrencyError(error: unknown) {
  if (isUniqueError(error)) return true;
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("serialize") || message.includes("deadlock");
  }
  return false;
}

async function createVerifiedUser(index: number) {
  const suffix = `${runTag}-${index}-${Math.random().toString(36).slice(2, 6)}`;

  const user = await prisma.user.create({
    data: {
      firstName: `Stress${index}`,
      lastName: "Spec",
      email: `stress.${suffix}@example.test`,
      phone: `811${String(index).padStart(7, "0")}`,
      password: "phase4-stress",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: `STR${Date.now()}${String(index).padStart(3, "0")}`,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `stress-tx-${suffix}`,
      proofUrl: `stress-proof-${suffix}`,
      status: "VERIFIED",
    },
  });

  return user;
}

describe("integration: team registration stress", () => {
  afterAll(async () => {
    await prisma.registrationOperation.deleteMany({ where: { operationId: { startsWith: `${runTag}-` } } });
    await prisma.eventRegistration.deleteMany({ where: { stationId: { startsWith: `${runTag}-` } } });
    await prisma.team.deleteMany({ where: { name: { startsWith: `PHASE4-STRESS-${runTag}` } } });
    await prisma.event.deleteMany({ where: { name: { startsWith: `PHASE4-STRESS-${runTag}` } } });
    await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "stress-tx-phase4-stress-" } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "stress.phase4-stress-" } } });
    await prisma.$disconnect();
  });

  it("enforces single-winner lock semantics over repeated parallel TEAM_COMPLETE attempts", async () => {
    const iterations = 8;
    let invariantViolations = 0;
    let successfulRounds = 0;

    for (let round = 0; round < iterations; round += 1) {
      const eventName = `PHASE4-STRESS-${runTag}-LOCK-${round}`;
      const teamName = `PHASE4-STRESS-${runTag}-TEAM-${round}`;

      const event = await prisma.event.create({
        data: {
          name: eventName,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants: 100,
          maxTeams: 20,
          isActive: true,
          date: new Date(),
        },
      });

      const users = await Promise.all([
        createVerifiedUser(round * 10 + 1),
        createVerifiedUser(round * 10 + 2),
        createVerifiedUser(round * 10 + 3),
      ]);

      const shacklesIds = users
        .map((user) => user.shacklesId)
        .filter((value): value is string => Boolean(value));

      const [a, b] = await Promise.allSettled([
        runSerializableTransaction(prisma, (tx) =>
          bulkRegisterAndLockTeamByShacklesIds({
            db: tx,
            eventName,
            teamName,
            shacklesIds,
            leaderShacklesId: shacklesIds[0],
            stationId: `${runTag}-lock-a`,
            operationId: `${runTag}-lock-op-a-${round}`,
          })
        ),
        runSerializableTransaction(prisma, (tx) =>
          bulkRegisterAndLockTeamByShacklesIds({
            db: tx,
            eventName,
            teamName,
            shacklesIds,
            leaderShacklesId: shacklesIds[0],
            stationId: `${runTag}-lock-b`,
            operationId: `${runTag}-lock-op-b-${round}`,
          })
        ),
      ]);

      const fulfilled = [a, b].filter((entry): entry is PromiseFulfilledResult<TeamServiceResult> => entry.status === "fulfilled");
      const rejected = [a, b].filter((entry): entry is PromiseRejectedResult => entry.status === "rejected");
      const successCount = fulfilled.filter((entry) => entry.value.success).length;

      if (successCount === 1) {
        successfulRounds += 1;
      }

      if (successCount !== 1) {
        invariantViolations += 1;
      }

      for (const entry of fulfilled) {
        if (!entry.value.success && !["ALREADY_REGISTERED", "TEAM_LOCKED"].includes(entry.value.reason)) {
          invariantViolations += 1;
        }
      }

      for (const entry of rejected) {
        if (!isKnownConcurrencyError(entry.reason)) {
          invariantViolations += 1;
        }
      }

      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      });

      if (
        registrations.length !== shacklesIds.length ||
        new Set(registrations.map((row) => row.userId)).size !== shacklesIds.length
      ) {
        invariantViolations += 1;
      }

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
        select: { status: true, memberCount: true },
      });

      if (!team || team.status !== "LOCKED" || team.memberCount !== shacklesIds.length) {
        invariantViolations += 1;
      }
    }

    const successRate = successfulRounds / iterations;
    expect(invariantViolations).toBe(0);
    expect(successRate).toBeGreaterThanOrEqual(0.9);
  }, 90_000);

  it("preserves participant capacity under repeated parallel TEAM_ADD contention", async () => {
    const rounds = 6;
    const maxParticipants = 3;
    const attemptsPerRound = 5;

    let roundsWithinCapacity = 0;
    let invariantViolations = 0;

    for (let round = 0; round < rounds; round += 1) {
      const eventName = `PHASE4-STRESS-${runTag}-CAP-${round}`;

      const event = await prisma.event.create({
        data: {
          name: eventName,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants,
          maxTeams: 20,
          isActive: true,
          date: new Date(),
        },
      });

      const users = await Promise.all(
        Array.from({ length: attemptsPerRound }).map((_, index) => createVerifiedUser(round * 100 + index + 1))
      );

      const settled = await Promise.allSettled(
        users.map((user, index) =>
          runSerializableTransaction(prisma, (tx) =>
            addMemberToTeamEvent({
              db: tx,
              userId: user.id,
              eventName,
              teamName: `PHASE4-STRESS-${runTag}-CAP-TEAM-${round}-${index}`,
              stationId: `${runTag}-cap-${round}`,
              clientOperationId: `${runTag}-cap-op-${round}-${index}`,
            })
          )
        )
      );

      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: event.id },
        select: { userId: true },
      });

      if (registrations.length <= maxParticipants) {
        roundsWithinCapacity += 1;
      } else {
        invariantViolations += 1;
      }

      if (new Set(registrations.map((row) => row.userId)).size !== registrations.length) {
        invariantViolations += 1;
      }

      for (const outcome of settled) {
        if (outcome.status === "fulfilled") {
          if (!outcome.value.success && !["CAPACITY_FULL", "TEAM_SLOTS_FULL"].includes(outcome.value.reason)) {
            invariantViolations += 1;
          }
        } else if (!isKnownConcurrencyError(outcome.reason)) {
          invariantViolations += 1;
        }
      }
    }

    const capacityPreservationRate = roundsWithinCapacity / rounds;
    expect(invariantViolations).toBe(0);
    expect(capacityPreservationRate).toBe(1);
  }, 90_000);
});
