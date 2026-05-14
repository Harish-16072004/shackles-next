import { prisma } from "@/lib/prisma";
import { describe, expect, it } from "vitest";
import { bulkRegisterAndLockTeamByShacklesIds, bulkRegisterTeamByShacklesIds } from "../../src/server/services/team-registration.service";
import { runSerializableTransaction } from "../../src/server/services/transaction.service";
import { getActiveYear } from "../../src/lib/edition";

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
      gender: "MALE",
      shacklesId: `IN${Date.now()}${String(index).padStart(3, "0")}`.toUpperCase(),
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `int-tx-${idSuffix}`,
      proofUrl: `int-proof-${idSuffix}`,
      status: "VERIFIED",
      year: getActiveYear(),
      packageType: "COMBO",
    },
  });

  return user;
}

describe("integration: team registration transaction behavior", () => {
  it("keeps final state correct under concurrent lock attempts", async () => {
    const runTag = tag("phase4-int");
    const eventName = `EVENT${Date.now()}`;
    const teamName = `TEAM${Math.floor(Math.random() * 100000)}`;

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
          year: getActiveYear(),
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
      if (successful.length !== 1) {
        console.log("DEBUG: Parallel attempts results:", JSON.stringify({ a, b }, null, 2));
      }
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
      try { await prisma.eventRegistration.deleteMany({ where: { OR: [{ stationId: "phase4-int-a" }, { stationId: "phase4-int-b" }] } }); } catch (e) {}
      try { await prisma.team.deleteMany({ where: { name: { startsWith: "TEAM" } } }); } catch (e) {}
      try { await prisma.event.deleteMany({ where: { name: { startsWith: "EVENT" } } }); } catch (e) {}
      try { await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-int-" } } }); } catch (e) {}
      try { await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-int-" } } }); } catch (e) {}
    }
  }, 90000);

  it("registers team in draft mode without auto-attendance", async () => {
    const runTag = tag("phase4-draft");
    const eventName = `EDRAFT${Date.now()}`;
    const teamName = `TDRAFT${Math.floor(Math.random() * 100000)}`;

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
          year: getActiveYear(),
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

      expect(team?.status).toBe("OPEN");
      expect(team?.memberCount).toBe(shacklesIds.length);
    } finally {
      try { await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-draft" } }); } catch (e) {}
      try { await prisma.team.deleteMany({ where: { name: { startsWith: "TDRAFT" } } }); } catch (e) {}
      try { await prisma.event.deleteMany({ where: { name: { startsWith: "EDRAFT" } } }); } catch (e) {}
      try { await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-draft-" } } }); } catch (e) {}
      try { await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-draft-" } } }); } catch (e) {}
    }
  }, 30000);

  it("fails atomically when a Shackles ID is unknown", async () => {
    const runTag = tag("phase4-unknown");
    const eventName = `EUNK${Date.now()}`;
    const teamName = `TUNK${Math.floor(Math.random() * 100000)}`;

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
          year: getActiveYear(),
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
      try { await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-unknown" } }); } catch (e) {}
      try { await prisma.team.deleteMany({ where: { name: { startsWith: "TUNK" } } }); } catch (e) {}
      try { await prisma.event.deleteMany({ where: { name: { startsWith: "EUNK" } } }); } catch (e) {}
      try { await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-unknown-" } } }); } catch (e) {}
      try { await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-unknown-" } } }); } catch (e) {}
    }
  }, 30000);

  it("enforces team minimum size when lock is requested", async () => {
    const runTag = tag("phase4-min-lock");
    const eventName = `EMIN${Date.now()}`;
    const teamName = `TMIN${Math.floor(Math.random() * 100000)}`;

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
          year: getActiveYear(),
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

      expect(team?.status).toBe("OPEN");
    } finally {
      try { await prisma.eventRegistration.deleteMany({ where: { stationId: "phase4-min-lock" } }); } catch (e) {}
      try { await prisma.team.deleteMany({ where: { name: { startsWith: "TMIN" } } }); } catch (e) {}
      try { await prisma.event.deleteMany({ where: { name: { startsWith: "EMIN" } } }); } catch (e) {}
      try { await prisma.payment.deleteMany({ where: { transactionId: { startsWith: "int-tx-phase4-min-lock-" } } }); } catch (e) {}
      try { await prisma.user.deleteMany({ where: { email: { startsWith: "int.phase4-min-lock-" } } }); } catch (e) {}
    }
  }, 30000);
});
