import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { bulkRegisterAndLockTeamByShacklesIds, bulkRegisterTeamByShacklesIds } from "../../src/server/services/team-registration.service";
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

  it("registers team in draft mode without auto-attendance", async () => {
    const runTag = tag("phase4-draft");
    const eventName = `PHASE4-DRAFT-EVENT-${runTag}`;
    const teamName = `PHASE4 DRAFT TEAM ${runTag}`;

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
      ]);

      const shacklesIds = users
        .map((u) => u.shacklesId)
        .filter((value): value is string => Boolean(value));

      const result = await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterTeamByShacklesIds({
          db: tx,
          eventName,
          teamName,
          shacklesIds,
          leaderShacklesId: shacklesIds[0],
          stationId: "phase4-draft",
          operationId: `phase4-draft-op-${runTag}`,
          lockTeam: false,
          markAttended: false,
        })
      );

      expect(result.success).toBe(true);

      const registrations = await prisma.eventRegistration.findMany({
        where: { eventId: event.id },
      });

      expect(registrations).toHaveLength(shacklesIds.length);
      expect(registrations.every((row) => row.attended === false)).toBe(true);

      const normalizedTeamName = teamName.trim().replace(/\s+/g, " ").toUpperCase();
      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: normalizedTeamName,
          },
        },
      });

      expect(team?.status).toBe("DRAFT");
      expect(team?.memberCount).toBe(shacklesIds.length);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-draft" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "PHASE4 DRAFT TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "PHASE4-DRAFT-EVENT-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-draft-" } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-draft-" } } });
    }
  }, 30000);

  it("fails atomically when a Shackles ID is unknown", async () => {
    const runTag = tag("phase4-unknown");
    const eventName = `PHASE4-UNKNOWN-EVENT-${runTag}`;
    const teamName = `PHASE4 UNKNOWN TEAM ${runTag}`;

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

      const user = await createVerifiedUser(runTag, 1);
      const validId = user.shacklesId as string;

      const result = await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterTeamByShacklesIds({
          db: tx,
          eventName,
          teamName,
          shacklesIds: [validId, "UNKNOWN999"],
          leaderShacklesId: validId,
          stationId: "phase4-unknown",
          operationId: `phase4-unknown-op-${runTag}`,
          lockTeam: false,
          markAttended: false,
        })
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("USER_NOT_FOUND");
      }

      const registrations = await prisma.eventRegistration.findMany({ where: { eventId: event.id } });
      expect(registrations).toHaveLength(0);

      const teams = await prisma.team.findMany({ where: { eventId: event.id } });
      expect(teams).toHaveLength(0);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-unknown" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "PHASE4 UNKNOWN TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "PHASE4-UNKNOWN-EVENT-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-unknown-" } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-unknown-" } } });
    }
  }, 30000);

  it("enforces team minimum size when lock is requested", async () => {
    const runTag = tag("phase4-min-lock");
    const eventName = `PHASE4-MIN-LOCK-EVENT-${runTag}`;
    const teamName = `PHASE4 MIN LOCK TEAM ${runTag}`;

    try {
      const event = await prisma.event.create({
        data: {
          name: eventName,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 3,
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
      ]);
      const shacklesIds = users.map((u) => u.shacklesId as string);

      const result = await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterTeamByShacklesIds({
          db: tx,
          eventName,
          teamName,
          shacklesIds,
          leaderShacklesId: shacklesIds[0],
          stationId: "phase4-min-lock",
          operationId: `phase4-min-lock-op-${runTag}`,
          lockTeam: true,
          markAttended: false,
        })
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("TEAM_BELOW_MIN_SIZE");
      }

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });

      expect(team?.status).toBe("DRAFT");
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-min-lock" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "PHASE4 MIN LOCK TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "PHASE4-MIN-LOCK-EVENT-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-min-lock-" } } });
      await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-min-lock-" } } });
    }
  }, 30000);
});
