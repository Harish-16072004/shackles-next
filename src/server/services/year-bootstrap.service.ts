import type { PrismaClient } from "@prisma/client";

type BootstrapInput = {
  db: PrismaClient;
  targetYear: number;
  templateYear: number;
  dryRun?: boolean;
};

export type BootstrapResult = {
  totalTemplates: number;
  candidateTemplates: number;
  created: number;
};

export async function cloneTemplateEventsToYear(input: BootstrapInput): Promise<BootstrapResult> {
  const templates = await input.db.event.findMany({
    where: {
      year: input.templateYear,
      isTemplate: true,
      isArchived: false,
    },
    orderBy: [{ name: "asc" }],
  });

  if (templates.length === 0) {
    throw new Error(`No template events found for year ${input.templateYear}.`);
  }

  const existingTargetEvents = await input.db.event.findMany({
    where: {
      year: input.targetYear,
    },
    select: {
      id: true,
      name: true,
      templateSourceId: true,
    },
  });

  const existingNames = new Set(existingTargetEvents.map((event) => event.name.toUpperCase()));
  const existingTemplateSourceIds = new Set(
    existingTargetEvents
      .map((event) => event.templateSourceId)
      .filter((value): value is string => Boolean(value))
  );

  const toClone = templates.filter((template) => {
    if (existingTemplateSourceIds.has(template.id)) return false;
    if (existingNames.has(template.name.toUpperCase())) return false;
    return true;
  });

  if (input.dryRun || toClone.length === 0) {
    return {
      totalTemplates: templates.length,
      candidateTemplates: toClone.length,
      created: 0,
    };
  }

  const created = await input.db.$transaction(async (tx) => {
    let createdCount = 0;

    for (const template of toClone) {
      const alreadyExists = await tx.event.findFirst({
        where: {
          year: input.targetYear,
          name: template.name,
        },
        select: { id: true },
      });

      if (alreadyExists) continue;

      await tx.event.create({
        data: {
          name: template.name,
          year: input.targetYear,
          type: template.type,
          dayLabel: template.dayLabel,
          date: template.date,
          endDate: template.endDate,
          description: template.description,
          rulesUrl: template.rulesUrl,
          coordinatorName: template.coordinatorName,
          coordinatorPhone: template.coordinatorPhone,
          trainerName: template.trainerName,
          contactName: template.contactName,
          contactPhone: template.contactPhone,
          participationMode: template.participationMode,
          isAllDay: template.isAllDay,
          teamMinSize: template.teamMinSize,
          teamMaxSize: template.teamMaxSize,
          maxTeams: template.maxTeams,
          maxParticipants: template.maxParticipants,
          isActive: true,
          isArchived: false,
          isTemplate: false,
          templateSourceId: template.id,
        },
      });

      createdCount += 1;
    }

    return createdCount;
  });

  return {
    totalTemplates: templates.length,
    candidateTemplates: toClone.length,
    created,
  };
}
