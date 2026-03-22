import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { bulkRegisterAndLockTeamByShacklesIds } from "../../src/server/services/team-registration.service";
import { runSerializableTransaction } from "../../src/server/services/transaction.service";

const prisma = new PrismaClient();

function tag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function createVerifiedUser(runTag: string, index: number) {
  const idSuffix = `${runTag}-${index}`;
  const user = await prisma.user.create({
    data: {
      firstName: `Integration${index}`,
      lastName: "Spec",
      email: `int.${idSuffix}@example.test`,
      phone: `80000${String(index).padStart(5, "0")}`,
      password: "integration-test",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: `IN${Date.now()}${String(index).padStart(3, "0")}`,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `int-tx-${idSuffix}`,
      proofUrl: `int-proof-${idSuffix}`,
      status: "VERIFIED",
    },
  });

  return user;
}

describe("integration: team registration transaction behavior", () => {
  it("keeps final state correct under concurrent lock attempts", async () => {
    const runTag = tag("phase4-int");
    const eventName = `PHASE4-INT-EVENT-${runTag}`;
    const teamName = `PHASE4 INT TEAM ${runTag}`;

    try {
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
        createVerifiedUser(runTag, 1),
        createVerifiedUser(runTag, 2),
        createVerifiedUser(runTag, 3),
      ]);

      const shacklesIds = users
        .map((u) => u.shacklesId)
        .filter((value): value is string => Boolean(value));

      const [a, b] = await Promise.allSettled([
        runSerializableTransaction(prisma, (tx) =>
          bulkRegisterAndLockTeamByShacklesIds({
            db: tx,
            eventName,
            teamName,
            shacklesIds,
            leaderShacklesId: shacklesIds[0],
            stationId: "phase4-int-a",
            operationId: `phase4-int-op-a-${runTag}`,
          })
        ),
        runSerializableTransaction(prisma, (tx) =>
          bulkRegisterAndLockTeamByShacklesIds({
            db: tx,
            eventName,
            teamName,
            shacklesIds,
            leaderShacklesId: shacklesIds[0],
            stationId: "phase4-int-b",
            operationId: `phase4-int-op-b-${runTag}`,
          })
        ),
      ]);

      const successful = [a, b].filter((r) => r.status === "fulfilled" && r.value.success);
      expect(successful.length).toBe(1);

      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: event.id },
      });

      expect(registrations).toHaveLength(shacklesIds.length);
      expect(new Set(registrations.map((row) => row.userId)).size).toBe(shacklesIds.length);

      const normalizedTeamName = teamName.trim().replace(/\s+/g, " ").toUpperCase();
      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: normalizedTeamName,
          },
        },
      });

      expect(team?.status).toBe("LOCKED");
      expect(team?.memberCount).toBe(shacklesIds.length);
    } finally {
      await prisma.eventRegistration.deleteMany({
        where: {
          OR: [{ stationId: "phase4-int-a" }, { stationId: "phase4-int-b" }],
        },
      });

      await prisma.team.deleteMany({ where: { name: { startsWith: "PHASE4 INT TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "PHASE4-INT-EVENT-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-int-" } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-int-" } } });
    }
  }, 30000);
});
