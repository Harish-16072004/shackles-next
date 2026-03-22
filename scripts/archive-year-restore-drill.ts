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

  const candidate = await prisma.event.findFirst({
    where: {
      year,
      isArchived: true,
      isTemplate: false,
    },
    select: {
      id: true,
      name: true,
      isArchived: true,
      isActive: true,
    },
  });

  if (!candidate) {
    throw new Error(`No archived non-template event found for year ${year}.`);
  }

  const startedAt = Date.now();

  await prisma.event.update({
    where: { id: candidate.id },
    data: {
      isArchived: false,
      isActive: true,
    },
  });

  const restored = await prisma.event.findUnique({
    where: { id: candidate.id },
    select: { isArchived: true, isActive: true },
  });

  await prisma.event.update({
    where: { id: candidate.id },
    data: {
      isArchived: true,
      isActive: false,
    },
  });

  const rearchived = await prisma.event.findUnique({
    where: { id: candidate.id },
    select: { isArchived: true, isActive: true },
  });

  const outputDir = path.join(process.cwd(), "logs", "release-evidence");
  await mkdir(outputDir, { recursive: true });
  const tag = `restore-drill-${year}-${Date.now()}`;
  const evidencePath = path.join(outputDir, `${tag}.md`);

  const duration = Date.now() - startedAt;
  const pass = Boolean(restored && !restored.isArchived && restored.isActive && rearchived?.isArchived && !rearchived?.isActive);

  await writeFile(
    evidencePath,
    `# Archive Restore Drill\n\n` +
      `- Timestamp: ${new Date().toISOString()}\n` +
      `- Year: ${year}\n` +
      `- Event: ${candidate.name} (${candidate.id})\n` +
      `- Restore check: ${restored ? JSON.stringify(restored) : "missing"}\n` +
      `- Re-archive check: ${rearchived ? JSON.stringify(rearchived) : "missing"}\n` +
      `- Duration ms: ${duration}\n` +
      `- Result: ${pass ? "PASS" : "FAIL"}\n`,
    "utf8"
  );

  if (!pass) {
    throw new Error("Restore drill verification failed.");
  }

  console.log(`Restore drill evidence written: ${path.relative(process.cwd(), evidencePath)}`);
}

main()
  .catch((error) => {
    console.error("archive-year-restore-drill failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
