import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseYear(raw: string | undefined) {
  const year = Number(raw);
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    throw new Error(`Invalid year: ${raw ?? "<missing>"}`);
  }
  return year;
}

async function main() {
  const year = parseYear(process.argv[2]);
  const outputDir = path.join(process.cwd(), "logs", "archive-exports");
  await mkdir(outputDir, { recursive: true });

  const [events, teams, registrations] = await Promise.all([
    prisma.event.findMany({
      where: { year },
      select: {
        id: true,
        name: true,
        year: true,
        isActive: true,
        isArchived: true,
        isTemplate: true,
        templateSourceId: true,
        createdAt: true,
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.team.findMany({
      where: { event: { year } },
      select: {
        id: true,
        name: true,
        eventId: true,
        memberCount: true,
        status: true,
      },
    }),
    prisma.eventRegistration.findMany({
      where: { event: { year } },
      select: {
        id: true,
        userId: true,
        eventId: true,
        teamId: true,
        teamName: true,
        attended: true,
        source: true,
        createdAt: true,
      },
    }),
  ]);

  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(outputDir, `year-${year}-${now}.json`);

  const payload = {
    generatedAt: new Date().toISOString(),
    year,
    summary: {
      events: events.length,
      teams: teams.length,
      registrations: registrations.length,
    },
    storagePrefixes: [
      `uploads/qr-codes/${year}/`,
      `uploads/payment-proofs/`,
    ],
    events,
    teams,
    registrations,
  };

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Archive export written: ${path.relative(process.cwd(), filePath)}`);
}

main()
  .catch((error) => {
    console.error("archive-year-export failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
