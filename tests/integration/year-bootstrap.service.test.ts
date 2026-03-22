import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { cloneTemplateEventsToYear } from "../../src/server/services/year-bootstrap.service";

const prisma = new PrismaClient();

function runTag() {
  return `bootstrap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

describe("integration: year bootstrap service", () => {
  it("is idempotent for repeated clone operations", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      console.warn("Skipping year-bootstrap integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const templateYear = 2026;
    const targetYear = 2029;

    try {
      const templateA = await prisma.event.create({
        data: {
          name: `TPL-A-${tag}`,
          year: templateYear,
          type: "TECHNICAL",
          isTemplate: true,
          isActive: false,
          isArchived: false,
          participationMode: "INDIVIDUAL",
        },
      });

      const templateB = await prisma.event.create({
        data: {
          name: `TPL-B-${tag}`,
          year: templateYear,
          type: "NON-TECHNICAL",
          isTemplate: true,
          isActive: false,
          isArchived: false,
          participationMode: "TEAM",
          teamMinSize: 2,
          teamMaxSize: 4,
        },
      });

      const firstRun = await cloneTemplateEventsToYear({
        db: prisma,
        templateYear,
        targetYear,
      });

      expect(firstRun.created).toBe(2);

      const secondRun = await cloneTemplateEventsToYear({
        db: prisma,
        templateYear,
        targetYear,
      });

      expect(secondRun.created).toBe(0);

      const cloned = await prisma.event.findMany({
        where: {
          year: targetYear,
          OR: [{ templateSourceId: templateA.id }, { templateSourceId: templateB.id }],
        },
      });

      expect(cloned).toHaveLength(2);
      expect(cloned.every((event) => !event.isTemplate && !event.isArchived && event.isActive)).toBe(true);
    } finally {
      await prisma.event.deleteMany({
        where: {
          OR: [
            { name: { startsWith: `TPL-A-${tag}` } },
            { name: { startsWith: `TPL-B-${tag}` } },
          ],
        },
      });

      await prisma.event.deleteMany({
        where: {
          year: targetYear,
          OR: [
            { name: { startsWith: `TPL-A-${tag}` } },
            { name: { startsWith: `TPL-B-${tag}` } },
          ],
        },
      });
    }
  }, 30000);
});
