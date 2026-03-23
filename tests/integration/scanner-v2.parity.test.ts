import { PrismaClient, TeamStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  getSession: vi.fn(async () => null),
}));

import {
  getScannerJoinableTeams,
  lockTeamAfterRegistration,
  markEventAttendance,
  quickRegisterForEvent,
  scanParticipantQR,
  scannerBulkRegisterTeam,
  scannerRegisterTeamMember,
  updateKitStatus,
  validateTeamRegistration,
} from "../../src/server/actions/event-logistics";

const prisma = new PrismaClient();

function runTag(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function createVerifiedUser(input: {
  tag: string;
  suffix: string;
  shacklesId: string;
  qrToken?: string;
}) {
  const user = await prisma.user.create({
    data: {
      firstName: `Scanner${input.suffix}`,
      lastName: "Parity",
      email: `${input.suffix}-${input.tag}@example.test`,
      phone: `84444${Math.floor(Math.random() * 89999 + 10000)}`,
      password: "integration-test",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: input.shacklesId,
      ...(input.qrToken ? { qrToken: input.qrToken } : {}),
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `scanner-pay-${input.suffix}-${input.tag}`,
      proofUrl: `scanner-proof-${input.suffix}-${input.tag}`,
      status: "VERIFIED",
    },
  });

  return user;
}

describe("integration: scanner-v2 parity coverage", () => {
  it("covers scan, kit, attendance, and quick-register branches", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping scanner parity integration test: database is not reachable.");
      return;
    }

    const tag = runTag("scanner-core");
    const activeYear = 2041;
    const previousActiveYear = process.env.ACTIVE_YEAR;
    process.env.ACTIVE_YEAR = String(activeYear);

    const qrToken = `scanner-token-${tag}`;
    const attendanceEventName = `SCANNER-ATTEND-${tag}`;
    const quickEventName = `SCANNER-QUICK-${tag}`;

    try {
      const participant = await createVerifiedUser({
        tag,
        suffix: "core",
        shacklesId: `SH${String(activeYear).slice(-2)}G901`,
        qrToken,
      });

      const attendanceEvent = await prisma.event.create({
        data: {
          name: attendanceEventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "INDIVIDUAL",
          isActive: true,
          isArchived: false,
          isTemplate: false,
          date: new Date(),
        },
      });

      const quickEvent = await prisma.event.create({
        data: {
          name: quickEventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "INDIVIDUAL",
          isActive: true,
          isArchived: false,
          isTemplate: false,
          date: new Date(),
        },
      });

      await prisma.eventRegistration.create({
        data: {
          userId: participant.id,
          eventId: attendanceEvent.id,
          teamSize: 1,
          attended: false,
        },
      });

      const scanResult = await scanParticipantQR(qrToken);
      expect(scanResult.success).toBe(true);
      expect(scanResult.data?.id).toBe(participant.id);

      const kitResult = await updateKitStatus(participant.id);
      expect(kitResult.success).toBe(true);
      const updated = await prisma.user.findUnique({
        where: { id: participant.id },
        select: { kitStatus: true, kitIssuedAt: true },
      });
      expect(updated?.kitStatus).toBe("ISSUED");
      expect(updated?.kitIssuedAt).toBeTruthy();

      const attendanceResult = await markEventAttendance(participant.id, attendanceEventName);
      expect(attendanceResult.success).toBe(true);
      const attended = await prisma.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId: participant.id,
            eventId: attendanceEvent.id,
          },
        },
      });
      expect(attended?.attended).toBe(true);

      const quickResult = await quickRegisterForEvent(participant.id, quickEventName);
      expect(quickResult.success).toBe(true);
      const quickReg = await prisma.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId: participant.id,
            eventId: quickEvent.id,
          },
        },
      });
      expect(quickReg?.attended).toBe(true);
    } finally {
      await prisma.eventRegistration.deleteMany({
        where: {
          event: {
            name: {
              in: [attendanceEventName, quickEventName],
            },
          },
        },
      });
      await prisma.event.deleteMany({ where: { name: { in: [attendanceEventName, quickEventName] } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
      if (previousActiveYear) {
        process.env.ACTIVE_YEAR = previousActiveYear;
      } else {
        delete process.env.ACTIVE_YEAR;
      }
    }
  }, 30000);

  it("covers team create/join + explicit lock branch", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping scanner parity integration test: database is not reachable.");
      return;
    }

    const tag = runTag("scanner-team");
    const activeYear = 2042;
    const previousActiveYear = process.env.ACTIVE_YEAR;
    process.env.ACTIVE_YEAR = String(activeYear);

    const eventName = `SCANNER-TEAM-${tag}`;
    const teamName = `SCANNER TEAM ${tag}`;

    try {
      const event = await prisma.event.create({
        data: {
          name: eventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants: 30,
          maxTeams: 10,
          isActive: true,
          isArchived: false,
          isTemplate: false,
          date: new Date(),
        },
      });

      const leader = await createVerifiedUser({
        tag,
        suffix: "leader",
        shacklesId: `SH${String(activeYear).slice(-2)}G011`,
      });
      const member = await createVerifiedUser({
        tag,
        suffix: "member",
        shacklesId: `SH${String(activeYear).slice(-2)}G012`,
      });

      const firstAdd = await scannerRegisterTeamMember(leader.id, eventName, teamName);
      expect(firstAdd.success).toBe(true);

      const secondAdd = await scannerRegisterTeamMember(member.id, eventName, teamName);
      expect(secondAdd.success).toBe(true);

      const lockResult = await lockTeamAfterRegistration({
        eventName,
        teamName,
        leaderUserId: leader.id,
      });
      expect(lockResult.success).toBe(true);

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });

      expect(team?.status).toBe(TeamStatus.LOCKED);
      expect(team?.memberCount).toBe(2);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: { startsWith: "SCANNER:" } } });
      await prisma.eventRegistration.deleteMany({ where: { event: { name: { startsWith: "SCANNER-TEAM-" } } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "SCANNER TEAM " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "SCANNER-TEAM-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
      if (previousActiveYear) {
        process.env.ACTIVE_YEAR = previousActiveYear;
      } else {
        delete process.env.ACTIVE_YEAR;
      }
    }
  }, 30000);

  it("covers bulk validate (dry-run), draft registration, joinable team lookup, and lock", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping scanner parity integration test: database is not reachable.");
      return;
    }

    const tag = runTag("scanner-bulk");
    const activeYear = 2043;
    const previousActiveYear = process.env.ACTIVE_YEAR;
    const previousBulkFlag = process.env.ENABLE_SCANNER_BULK_TEAM_FLOW;
    process.env.ACTIVE_YEAR = String(activeYear);
    process.env.ENABLE_SCANNER_BULK_TEAM_FLOW = "true";

    const eventName = `SCANNER-BULK-${tag}`;
    const teamName = `SCANNER BULK ${tag}`;

    try {
      const event = await prisma.event.create({
        data: {
          name: eventName,
          year: activeYear,
          type: "TECHNICAL",
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
          maxParticipants: 30,
          maxTeams: 10,
          isActive: true,
          isArchived: false,
          isTemplate: false,
          date: new Date(),
        },
      });

      const userA = await createVerifiedUser({
        tag,
        suffix: "a",
        shacklesId: `SH${String(activeYear).slice(-2)}G021`,
      });
      const userB = await createVerifiedUser({
        tag,
        suffix: "b",
        shacklesId: `SH${String(activeYear).slice(-2)}G022`,
      });

      const validation = await validateTeamRegistration({
        eventName,
        teamName,
        memberShacklesIds: [userA.shacklesId as string, userB.shacklesId as string],
        leaderShacklesId: userA.shacklesId as string,
      });
      expect(validation.success).toBe(true);

      const dryRunTeam = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });
      expect(dryRunTeam).toBeNull();

      const bulkDraft = await scannerBulkRegisterTeam({
        eventName,
        teamName,
        memberShacklesIds: [userA.shacklesId as string, userB.shacklesId as string],
        leaderShacklesId: userA.shacklesId as string,
        lockTeam: false,
      });
      expect(bulkDraft.success).toBe(true);

      const joinable = await getScannerJoinableTeams({
        eventName,
        query: "SCANNER BULK",
      });
      expect(joinable.some((team) => team.name === teamName)).toBe(true);

      const lockResult = await lockTeamAfterRegistration({
        eventName,
        teamName,
        leaderUserId: userA.id,
      });
      expect(lockResult.success).toBe(true);

      const team = await prisma.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: teamName.trim().replace(/\s+/g, " ").toUpperCase(),
          },
        },
      });
      expect(team?.status).toBe(TeamStatus.LOCKED);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { stationId: { startsWith: "SCANNER:" } } });
      await prisma.eventRegistration.deleteMany({ where: { event: { name: { startsWith: "SCANNER-BULK-" } } } });
      await prisma.team.deleteMany({ where: { name: { startsWith: "SCANNER BULK " } } });
      await prisma.event.deleteMany({ where: { name: { startsWith: "SCANNER-BULK-" } } });
      await prisma.payment.deleteMany({ where: { transactionId: { contains: tag } } });
      await prisma.user.deleteMany({ where: { email: { contains: tag } } });
      if (previousActiveYear) {
        process.env.ACTIVE_YEAR = previousActiveYear;
      } else {
        delete process.env.ACTIVE_YEAR;
      }
      if (typeof previousBulkFlag === "string") {
        process.env.ENABLE_SCANNER_BULK_TEAM_FLOW = previousBulkFlag;
      } else {
        delete process.env.ENABLE_SCANNER_BULK_TEAM_FLOW;
      }
    }
  }, 30000);
});
