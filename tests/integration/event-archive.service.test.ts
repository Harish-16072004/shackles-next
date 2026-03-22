import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { archiveEventById, restoreEventById } from "@/server/services/event-archive.service";

const prisma = new PrismaClient();

function runTag() {
  return `event-archive-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

describe("integration: event archive service", () => {
  it("archives and restores without deleting registrations", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("Skipping event-archive integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const eventName = `ARCHIVE-EVENT-${tag}`;
    const eventYear = 2033;

    const user = await prisma.user.create({
      data: {
        firstName: "Archive",
        lastName: "Tester",
        email: `archive-${tag}@example.test`,
        phone: `82222${Math.floor(Math.random() * 89999 + 10000)}`,
        password: "integration-test",
        collegeName: "ACGCET",
        collegeLoc: "Karaikudi",
        department: "Mechanical",
        yearOfStudy: "IV",
      },
    });

    const event = await prisma.event.create({
      data: {
        name: eventName,
        year: eventYear,
        type: "TECHNICAL",
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
    });

    await prisma.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        teamSize: 1,
        year: eventYear,
      },
    });

    try {
      const archived = await archiveEventById(prisma, event.id);
      expect(archived).toMatchObject({
        id: event.id,
        isArchived: true,
        isActive: false,
      });

      const countAfterArchive = await prisma.eventRegistration.count({
        where: { eventId: event.id },
      });
      expect(countAfterArchive).toBe(1);

      const restored = await restoreEventById(prisma, event.id);
      expect(restored).toMatchObject({
        id: event.id,
        isArchived: false,
        isActive: true,
      });

      const countAfterRestore = await prisma.eventRegistration.count({
        where: { eventId: event.id },
      });
      expect(countAfterRestore).toBe(1);
    } finally {
      await prisma.eventRegistration.deleteMany({ where: { eventId: event.id } });
      await prisma.event.deleteMany({ where: { id: event.id } });
      await prisma.payment.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }, 30000);
});
