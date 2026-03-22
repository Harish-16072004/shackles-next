import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { allocateShacklesId } from "../../src/server/services/shackles-id.service";

const prisma = new PrismaClient();
let databaseAvailable = true;

function runTag() {
  return `shid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

describe("integration: yearly shackles id sequence", () => {
  it("resets per year and remains unique under parallel issuance", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseAvailable = false;
    }

    if (!databaseAvailable) {
      console.warn("Skipping shackles-id.sequence integration test: database is not reachable.");
      return;
    }

    const tag = runTag();
    const yearA = 2027;
    const yearB = 2028;

    try {
      const parallel = await Promise.all(
        Array.from({ length: 10 }).map(() =>
          prisma.$transaction(
            async (tx) => allocateShacklesId({ tx, year: yearA, registrationType: "GENERAL" }),
            { isolationLevel: "Serializable" }
          )
        )
      );

      expect(new Set(parallel).size).toBe(10);
      expect(parallel.every((id) => id.startsWith("SH27G"))).toBe(true);
      expect(parallel.includes("SH27G001")).toBe(true);
      expect(parallel.includes("SH27G010")).toBe(true);

      const firstNextYear = await prisma.$transaction(
        async (tx) => allocateShacklesId({ tx, year: yearB, registrationType: "GENERAL" }),
        { isolationLevel: "Serializable" }
      );

      expect(firstNextYear).toBe("SH28G001");

      const firstWorkshop = await prisma.$transaction(
        async (tx) => allocateShacklesId({ tx, year: yearA, registrationType: "WORKSHOP" }),
        { isolationLevel: "Serializable" }
      );

      expect(firstWorkshop).toBe("SH27W001");

      await prisma.registrationOperation.create({
        data: {
          operationId: `${tag}-evidence`,
          stationId: "sequence-test",
          operationType: "ATTENDANCE",
          status: "APPLIED",
          payload: {
            issued: parallel,
            firstNextYear,
            firstWorkshop,
          },
        },
      });
    } finally {
      await prisma.registrationOperation.deleteMany({
        where: { operationId: { startsWith: tag } },
      });

      await prisma.shacklesIdSequence.deleteMany({
        where: {
          OR: [
            { year: 2027 },
            { year: 2028 },
          ],
        },
      });
    }
  }, 30000);
});
