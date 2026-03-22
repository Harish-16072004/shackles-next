import { PrismaClient } from "@prisma/client";
import { logAdminAudit } from "../src/lib/admin-audit";
import { cloneTemplateEventsToYear } from "../src/server/services/year-bootstrap.service";

const prisma = new PrismaClient();

type CliOptions = {
  targetYear: number;
  templateYear: number;
  dryRun: boolean;
};

function parseYear(raw: string | undefined, label: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 3000) {
    throw new Error(`Invalid ${label}: ${raw ?? "<missing>"}. Expected an integer between 2000 and 3000.`);
  }
  return parsed;
}

function parseCliArgs(argv: string[]): CliOptions {
  if (argv.length === 0) {
    throw new Error("Usage: npm run bootstrap:year -- <targetYear> [--from=<templateYear>] [--dry-run]");
  }

  const targetYear = parseYear(argv[0], "target year");
  const fromArg = argv.find((arg) => arg.startsWith("--from="));
  const dryRun = argv.includes("--dry-run");
  const defaultTemplateYear = Number(process.env.ACTIVE_YEAR) || new Date().getUTCFullYear();
  const templateYear = fromArg
    ? parseYear(fromArg.split("=")[1], "template year")
    : defaultTemplateYear;

  if (templateYear === targetYear) {
    throw new Error("Template year and target year must be different for cloning.");
  }

  return { targetYear, templateYear, dryRun };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const dryRunResult = await cloneTemplateEventsToYear({
    db: prisma,
    targetYear: options.targetYear,
    templateYear: options.templateYear,
    dryRun: true,
  });

  if (dryRunResult.candidateTemplates === 0) {
    await logAdminAudit({
      action: "YEAR_BOOTSTRAP",
      actorId: "SYSTEM_BOOTSTRAP",
      actorEmail: null,
      target: String(options.targetYear),
      status: "SUCCESS",
      details: {
        templateYear: options.templateYear,
        dryRun: options.dryRun,
        created: 0,
        skippedAsExisting: dryRunResult.totalTemplates,
      },
    });

    console.log(
      `No-op: target year ${options.targetYear} already has all ${dryRunResult.totalTemplates} template events.`
    );
    return;
  }

  if (options.dryRun) {
    await logAdminAudit({
      action: "YEAR_BOOTSTRAP_DRY_RUN",
      actorId: "SYSTEM_BOOTSTRAP",
      actorEmail: null,
      target: String(options.targetYear),
      status: "SUCCESS",
      details: {
        templateYear: options.templateYear,
        dryRun: true,
        wouldCreate: dryRunResult.candidateTemplates,
      },
    });

    console.log(
      `Dry run: would clone ${dryRunResult.candidateTemplates}/${dryRunResult.totalTemplates} template events from ${options.templateYear} to ${options.targetYear}.`
    );
    return;
  }
  const result = await cloneTemplateEventsToYear({
    db: prisma,
    targetYear: options.targetYear,
    templateYear: options.templateYear,
    dryRun: false,
  });

  console.log(
    `Cloned ${result.created} template events from ${options.templateYear} to ${options.targetYear}.`
  );

  await logAdminAudit({
    action: "YEAR_BOOTSTRAP",
    actorId: "SYSTEM_BOOTSTRAP",
    actorEmail: null,
    target: String(options.targetYear),
    status: "SUCCESS",
    details: {
      templateYear: options.templateYear,
      dryRun: false,
      created: result.created,
      candidateTemplates: result.candidateTemplates,
    },
  });
}

main()
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bootstrap-year failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
