import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendTeamInviteEmail: vi.fn(async () => ({ success: true })),
}));

import { getSession } from "@/lib/session";
import { POST as registerPost } from "@/app/api/events/register/route";
import { bulkRegisterTeamByShacklesIds } from "../../src/server/services/team-registration.service";
import { runSerializableTransaction } from "../../src/server/services/transaction.service";

const prisma = new PrismaClient();

function runTag() {
  return `team-route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function createVerifiedUser(tag: string, suffix: string, shacklesId: string) {
  const user = await prisma.user.create({
    data: {
      firstName: `Route${suffix}`,
      lastName: "Tester",
      email: `${suffix}-${tag}@example.test`,
      phone: `82222${Math.floor(Math.random() * 89999 + 10000)}`,
      password: "integration-test",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `route-pay-${suffix}-${tag}`,
      proofUrl: `route-proof-${suffix}-${tag}`,
      status: "VERIFIED",
    },
  });

  return user;
}

describe("integration: team registration route compatibility", () => {
  const previousActiveYear = process.env.ACTIVE_YEAR;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (previousActiveYear) {
      process.env.ACTIVE_YEAR = previousActiveYear;
    } else {
      delete process.env.ACTIVE_YEAR;
    }
  });

  it("allows team-code joins for scanner-created draft team", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping route compatibility test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2033;
    process.env.ACTIVE_YEAR = String(activeYear);

    const eventName = `ROUTE-DRAFT-${tag}`;
    const teamName = `ROUTE DRAFT TEAM ${tag}`;

    try {
      const event = await prisma.event.create({
        data: {
          name: eventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants: 50,
          maxTeams: 10,
          isActive: true,
          isArchived: false,
          isTemplate: false,
        },
      });

      const scannerMember = await createVerifiedUser(tag, "scanner", `RT${activeYear % 100}A${Math.floor(Math.random() * 899 + 100)}`);
      const joiningMember = await createVerifiedUser(tag, "joiner", `RT${activeYear % 100}B${Math.floor(Math.random() * 899 + 100)}`);

      await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterTeamByShacklesIds({
          db: tx,
          eventName,
          teamName,
          shacklesIds: [scannerMember.shacklesId as string],
          leaderShacklesId: scannerMember.shacklesId as string,
          stationId: "route-compat",
          operationId: `route-compat-draft-${tag}`,
          lockTeam: false,
          markAttended: false,
        })
      );

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });

      expect(team).toBeTruthy();
      expect(team?.status).toBe("DRAFT");

      vi.mocked(getSession).mockResolvedValue({ userId: joiningMember.id, role: "USER" } as never);

      const joinResponse = await registerPost(
        new Request("http://localhost/api/events/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "joinTeam",
            eventName,
            teamCode: team?.teamCode,
          }),
        })
      );

      expect(joinResponse.status).toBe(200);
      const joinBody = await joinResponse.json();
      expect(joinBody).toMatchObject({ message: "Registered successfully." });

      const registrations = await prisma.eventRegistration.findMany({ where: { eventId: event.id } });
      expect(registrations).toHaveLength(2);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "route-compat" } });
      await prisma.eventRegistration.deleteMany({ where: { event: { name: eventName } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "ROUTE DRAFT TEAM " } } });
      await prisma.event.deleteMany({ where: { name: eventName } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);

  it("rejects team-code joins after scanner lock", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping route compatibility test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2034;
    process.env.ACTIVE_YEAR = String(activeYear);

    const eventName = `ROUTE-LOCKED-${tag}`;
    const teamName = `ROUTE LOCKED TEAM ${tag}`;

    try {
      const event = await prisma.event.create({
        data: {
          name: eventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants: 50,
          maxTeams: 10,
          isActive: true,
          isArchived: false,
          isTemplate: false,
        },
      });

      const m1 = await createVerifiedUser(tag, "m1", `RL${activeYear % 100}A${Math.floor(Math.random() * 899 + 100)}`);
      const m2 = await createVerifiedUser(tag, "m2", `RL${activeYear % 100}B${Math.floor(Math.random() * 899 + 100)}`);
      const joiner = await createVerifiedUser(tag, "joiner", `RL${activeYear % 100}C${Math.floor(Math.random() * 899 + 100)}`);

      await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterTeamByShacklesIds({
          db: tx,
          eventName,
          teamName,
          shacklesIds: [m1.shacklesId as string, m2.shacklesId as string],
          leaderShacklesId: m1.shacklesId as string,
          stationId: "route-compat",
          operationId: `route-compat-lock-${tag}`,
          lockTeam: true,
          markAttended: false,
        })
      );

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });

      expect(team?.status).toBe("LOCKED");

      vi.mocked(getSession).mockResolvedValue({ userId: joiner.id, role: "USER" } as never);

      const joinResponse = await registerPost(
        new Request("http://localhost/api/events/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "joinTeam",
            eventName,
            teamCode: team?.teamCode,
          }),
        })
      );

      expect(joinResponse.status).toBe(409);
      const body = await joinResponse.json();
      expect(body).toMatchObject({
        error: "Team registration is already completed and locked.",
      });
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: "route-compat" } });
      await prisma.eventRegistration.deleteMany({ where: { event: { name: eventName } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "ROUTE LOCKED TEAM " } } });
      await prisma.event.deleteMany({ where: { name: eventName } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
    }
  }, 30000);
});
