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
import { GET as publicStatsGet } from "@/app/api/events/public-stats/route";

const prisma = new PrismaClient();

function runTag() {
  return `year-visibility-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureDatabaseAvailable() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

describe("integration: year visibility route enforcement", () => {
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

  it("public stats returns only active-year non-archived events", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping year-visibility route integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2031;
    process.env.ACTIVE_YEAR = String(activeYear);

    const activeVisibleName = `ACTIVE-VISIBLE-${tag}`;
    const activeArchivedName = `ACTIVE-ARCHIVED-${tag}`;
    const previousYearName = `PREVIOUS-YEAR-${tag}`;

    try {
      await prisma.event.createMany({
        data: [
          {
            name: activeVisibleName,
            year: activeYear,
            type: "TECHNICAL",
            isActive: true,
            isArchived: false,
            isTemplate: false,
          },
          {
            name: activeArchivedName,
            year: activeYear,
            type: "TECHNICAL",
            isActive: false,
            isArchived: true,
            isTemplate: false,
          },
          {
            name: previousYearName,
            year: activeYear - 1,
            type: "TECHNICAL",
            isActive: true,
            isArchived: false,
            isTemplate: false,
          },
        ],
      });

      const response = await publicStatsGet(new Request("http://localhost/api/events/public-stats?category=TECHNICAL"));
      expect(response.status).toBe(200);

      const body = (await response.json()) as { events?: Array<{ name: string; year: number }> };
      const names = (body.events || []).map((event) => event.name);

      expect(names).toContain(activeVisibleName);
      expect(names).not.toContain(activeArchivedName);
      expect(names).not.toContain(previousYearName);
      expect((body.events || []).every((event) => event.year === activeYear)).toBe(true);
    } finally {
      await prisma.eventRegistration.deleteMany({
        where: {
          event: {
            name: {
              in: [activeVisibleName, activeArchivedName, previousYearName],
            },
          },
        },
      });

      await prisma.event.deleteMany({
        where: {
          name: {
            in: [activeVisibleName, activeArchivedName, previousYearName],
          },
        },
      });
    }
  }, 30000);

  it("register endpoint rejects archived and non-active-year events", async () => {
    if (!(await ensureDatabaseAvailable())) {
      console.warn("Skipping year-visibility route integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const activeYear = 2032;
    process.env.ACTIVE_YEAR = String(activeYear);

    const user = await prisma.user.create({
      data: {
        firstName: "Route",
        lastName: "Tester",
        email: `route-${tag}@example.test`,
        phone: `81111${Math.floor(Math.random() * 89999 + 10000)}`,
        password: "integration-test",
        collegeName: "ACGCET",
        collegeLoc: "Karaikudi",
        department: "Mechanical",
        yearOfStudy: "IV",
        shacklesId: `SH${activeYear % 100}G900`,
      },
    });

    await prisma.payment.create({
      data: {
        userId: user.id,
        amount: 1,
        transactionId: `route-pay-${tag}`,
        proofUrl: `route-proof-${tag}`,
        status: "VERIFIED",
      },
    });

    const archivedEventName = `ARCHIVED-${tag}`;
    const nonActiveYearName = `NONACTIVE-${tag}`;

    try {
      await prisma.event.createMany({
        data: [
          {
            name: archivedEventName,
            year: activeYear,
            type: "TECHNICAL",
            isActive: false,
            isArchived: true,
            isTemplate: false,
          },
          {
            name: nonActiveYearName,
            year: activeYear - 1,
            type: "TECHNICAL",
            isActive: true,
            isArchived: false,
            isTemplate: false,
          },
        ],
      });

      vi.mocked(getSession).mockResolvedValue({
        userId: user.id,
        role: "USER",
      } as never);

      const archivedResponse = await registerPost(
        new Request("http://localhost/api/events/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "joinTeam",
            eventName: archivedEventName,
          }),
        })
      );

      expect(archivedResponse.status).toBe(404);
      expect(await archivedResponse.json()).toMatchObject({
        error: "Event is not available.",
      });

      const nonActiveYearResponse = await registerPost(
        new Request("http://localhost/api/events/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "joinTeam",
            eventName: nonActiveYearName,
          }),
        })
      );

      expect(nonActiveYearResponse.status).toBe(404);
      expect(await nonActiveYearResponse.json()).toMatchObject({
        error: "Event is not available.",
      });
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { userId: user.id } });
      await prisma.event.deleteMany({ where: { name: { in: [archivedEventName, nonActiveYearName] } } });
      await prisma.payment.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }, 30000);
});
