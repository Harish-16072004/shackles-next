import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { allocateShacklesId } from "../../src/server/services/shackles-id.service";
import { runSerializableTransaction } from "../../src/server/services/transaction.service";

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
          runSerializableTransaction(
            prisma,
            async (tx) => allocateShacklesId({ tx, year: yearA, registrationType: "GENERAL" }),
            { maxRetries: 5 }
          )
        )
      );

      expect(new Set(parallel).size).toBe(10);
      expect(parallel.every((id) => id.startsWith("SH27G"))).toBe(true);
      expect(parallel.includes("SH27G001")).toBe(true);
      expect(parallel.includes("SH27G010")).toBe(true);

      const firstNextYear = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year: yearB, registrationType: "GENERAL" }),
        { maxRetries: 5 }
      );

      expect(firstNextYear).toBe("SH28G001");

      const firstWorkshop = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year: yearA, registrationType: "WORKSHOP" }),
        { maxRetries: 5 }
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

  it("supports on-spot floor at 500 while preserving type prefix", async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      databaseAvailable = false;
    }

    if (!databaseAvailable) {
      console.warn("Skipping shackles-id.sequence integration test: database is not reachable.");
      return;
    }

    const year = 2029;

    try {
      const firstGeneral = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year, registrationType: "GENERAL", startFrom: 500 }),
        { maxRetries: 5 }
      );
      const secondGeneral = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year, registrationType: "GENERAL", startFrom: 500 }),
        { maxRetries: 5 }
      );
      const firstWorkshop = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year, registrationType: "WORKSHOP", startFrom: 500 }),
        { maxRetries: 5 }
      );
      const firstCombo = await runSerializableTransaction(
        prisma,
        async (tx) => allocateShacklesId({ tx, year, registrationType: "COMBO", startFrom: 500 }),
        { maxRetries: 5 }
      );

      expect(firstGeneral).toBe("SH29G500");
      expect(secondGeneral).toBe("SH29G501");
      expect(firstWorkshop).toBe("SH29W500");
      expect(firstCombo).toBe("SH29C500");
    } finally {
      await prisma.shacklesIdSequence.deleteMany({
        where: { year },
      });
    }
  }, 30000);
});
