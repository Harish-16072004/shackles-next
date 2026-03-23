import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { bulkRegisterTeamByShacklesIds } from "../../src/server/services/team-registration.service";

const prisma = new PrismaClient();

function runTag() {
  return `bulk-fail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function createUser(input: {
  tag: string;
  suffix: string;
  shacklesId: string;
  paymentStatus?: "VERIFIED" | "PENDING";
}) {
  const user = await prisma.user.create({
    data: {
      firstName: `Bulk${input.suffix}`,
      lastName: "Failure",
      email: `${input.suffix}-${input.tag}@example.test`,
      phone: `83333${Math.floor(Math.random() * 89999 + 10000)}`,
      password: "integration-test",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: input.shacklesId,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `bulk-fail-pay-${input.suffix}-${input.tag}`,
      proofUrl: `bulk-fail-proof-${input.suffix}-${input.tag}`,
      status: input.paymentStatus ?? "VERIFIED",
    },
  });

  return user;
}

async function createTeamEvent(input: {
  name: string;
  year: number;
  teamMinSize?: number;
  teamMaxSize?: number;
  maxParticipants?: number;
}) {
  return prisma.event.create({
    data: {
      name: input.name,
      year: input.year,
      type: "TECHNICAL",
      participationMode: "TEAM",
      teamMinSize: input.teamMinSize ?? 2,
      teamMaxSize: input.teamMaxSize ?? 4,
      maxParticipants: input.maxParticipants ?? 50,
      maxTeams: 10,
      isActive: true,
      isArchived: false,
      isTemplate: false,
      date: new Date(),
    },
  });
}

describe("integration: team bulk registration failure semantics", () => {
  it("returns INVALID_LEADER when leader is not part of submitted IDs", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping bulk failure integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2035;
    process.env.ACTIVE_YEAR = String(activeYear);
    const eventName = `BULK-INVALID-LEADER-${tag}`;

    try {
      await createTeamEvent({ name: eventName, year: activeYear });

      const userA = await createUser({ tag, suffix: "a", shacklesId: `BLA${Math.floor(Math.random() * 899 + 100)}` });
      const userB = await createUser({ tag, suffix: "b", shacklesId: `BLB${Math.floor(Math.random() * 899 + 100)}` });

      const result = await bulkRegisterTeamByShacklesIds({
        db: prisma,
        eventName,
        teamName: `BULK LEADER TEAM ${tag}`,
        shacklesIds: [userA.shacklesId as string, userB.shacklesId as string],
        leaderShacklesId: "NOT_IN_LIST",
        stationId: "bulk-fail",
        operationId: `bulk-fail-invalid-leader-${tag}`,
        lockTeam: false,
        markAttended: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("INVALID_LEADER");
      }
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "bulk-fail" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "BULK LEADER TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "BULK-INVALID-LEADER-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);

  it("returns PAYMENT_NOT_VERIFIED and writes nothing when any member is unpaid", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping bulk failure integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2035;
    process.env.ACTIVE_YEAR = String(activeYear);
    const eventName = `BULK-UNPAID-${tag}`;

    try {
      const event = await createTeamEvent({ name: eventName, year: activeYear });

      const paid = await createUser({ tag, suffix: "paid", shacklesId: `BUP${Math.floor(Math.random() * 899 + 100)}` });
      const unpaid = await createUser({ tag, suffix: "unpaid", shacklesId: `BUU${Math.floor(Math.random() * 899 + 100)}`, paymentStatus: "PENDING" });

      const result = await bulkRegisterTeamByShacklesIds({
        db: prisma,
        eventName,
        teamName: `BULK UNPAID TEAM ${tag}`,
        shacklesIds: [paid.shacklesId as string, unpaid.shacklesId as string],
        leaderShacklesId: paid.shacklesId as string,
        stationId: "bulk-fail",
        operationId: `bulk-fail-unpaid-${tag}`,
        lockTeam: false,
        markAttended: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("PAYMENT_NOT_VERIFIED");
      }

      const registrations = await prisma.eventRegistration.findMany({ where: { eventId: event.id } });
      const teams = await prisma.team.findMany({ where: { eventId: event.id } });
      expect(registrations).toHaveLength(0);
      expect(teams).toHaveLength(0);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "bulk-fail" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "BULK UNPAID TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "BULK-UNPAID-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);

  it("returns ALREADY_REGISTERED when any member already belongs to the event", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping bulk failure integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2035;
    process.env.ACTIVE_YEAR = String(activeYear);
    const eventName = `BULK-ALREADY-${tag}`;

    try {
      const event = await createTeamEvent({ name: eventName, year: activeYear });

      const already = await createUser({ tag, suffix: "already", shacklesId: `BAR${Math.floor(Math.random() * 899 + 100)}` });
      const fresh = await createUser({ tag, suffix: "fresh", shacklesId: `BAF${Math.floor(Math.random() * 899 + 100)}` });

      await prisma.eventRegistration.create({
        data: {
          userId: already.id,
          eventId: event.id,
          teamSize: 1,
          attended: false,
        },
      });

      const result = await bulkRegisterTeamByShacklesIds({
        db: prisma,
        eventName,
        teamName: `BULK ALREADY TEAM ${tag}`,
        shacklesIds: [already.shacklesId as string, fresh.shacklesId as string],
        leaderShacklesId: fresh.shacklesId as string,
        stationId: "bulk-fail",
        operationId: `bulk-fail-already-${tag}`,
        lockTeam: false,
        markAttended: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("ALREADY_REGISTERED");
      }
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { event: { name: { startsWith: "BULK-ALREADY-" } } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "BULK ALREADY TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "BULK-ALREADY-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);

  it("returns TEAM_ABOVE_MAX_SIZE when submitted member count exceeds event cap", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping bulk failure integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2035;
    process.env.ACTIVE_YEAR = String(activeYear);
    const eventName = `BULK-MAX-${tag}`;

    try {
      await createTeamEvent({ name: eventName, year: activeYear, teamMaxSize: 2 });

      const u1 = await createUser({ tag, suffix: "u1", shacklesId: `BMX${Math.floor(Math.random() * 899 + 100)}` });
      const u2 = await createUser({ tag, suffix: "u2", shacklesId: `BMY${Math.floor(Math.random() * 899 + 100)}` });
      const u3 = await createUser({ tag, suffix: "u3", shacklesId: `BMZ${Math.floor(Math.random() * 899 + 100)}` });

      const result = await bulkRegisterTeamByShacklesIds({
        db: prisma,
        eventName,
        teamName: `BULK MAX TEAM ${tag}`,
        shacklesIds: [u1.shacklesId as string, u2.shacklesId as string, u3.shacklesId as string],
        leaderShacklesId: u1.shacklesId as string,
        stationId: "bulk-fail",
        operationId: `bulk-fail-max-${tag}`,
        lockTeam: false,
        markAttended: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("TEAM_ABOVE_MAX_SIZE");
      }
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "bulk-fail" } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "BULK MAX TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "BULK-MAX-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);

  it("returns CAPACITY_FULL when event participant limit is exhausted", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping bulk failure integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2035;
    process.env.ACTIVE_YEAR = String(activeYear);
    const eventName = `BULK-CAP-${tag}`;

    try {
      const event = await createTeamEvent({ name: eventName, year: activeYear, maxParticipants: 2 });

      const existing1 = await createUser({ tag, suffix: "e1", shacklesId: `BCX${Math.floor(Math.random() * 899 + 100)}` });
      const existing2 = await createUser({ tag, suffix: "e2", shacklesId: `BCY${Math.floor(Math.random() * 899 + 100)}` });
      const newcomer = await createUser({ tag, suffix: "new", shacklesId: `BCZ${Math.floor(Math.random() * 899 + 100)}` });

      await prisma.eventRegistration.createMany({
        data: [
          { userId: existing1.id, eventId: event.id, teamSize: 1, attended: false },
          { userId: existing2.id, eventId: event.id, teamSize: 1, attended: false },
        ],
      });

      const result = await bulkRegisterTeamByShacklesIds({
        db: prisma,
        eventName,
        teamName: `BULK CAP TEAM ${tag}`,
        shacklesIds: [newcomer.shacklesId as string],
        leaderShacklesId: newcomer.shacklesId as string,
        stationId: "bulk-fail",
        operationId: `bulk-fail-cap-${tag}`,
        lockTeam: false,
        markAttended: false,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("CAPACITY_FULL");
      }
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { event: { name: { startsWith: "BULK-CAP-" } } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "BULK CAP TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "BULK-CAP-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);
});
