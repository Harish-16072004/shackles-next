import { Prisma, PrismaClient } from "@prisma/client";

export type ParticipantRow = {
  teamId: string | null;
  teamSize: number | null;
};

type CapacityDbClient = Prisma.TransactionClient | PrismaClient;

export function countParticipants(rows: ParticipantRow[]) {
  return rows.reduce((sum, row) => sum + (row.teamId ? 1 : row.teamSize || 1), 0);
}

export async function getEventParticipantCount(input: {
  db: CapacityDbClient;
  eventId: string;
}) {
  const [teamMemberCount, individualAggregate] = await Promise.all([
    input.db.eventRegistration.count({
      where: {
        eventId: input.eventId,
        teamId: { not: null },
      },
    }),
    input.db.eventRegistration.aggregate({
      where: {
        eventId: input.eventId,
        teamId: null,
      },
      _sum: {
        teamSize: true,
      },
    }),
  ]);

  return teamMemberCount + (individualAggregate._sum.teamSize ?? 0);
}

export function isMaxParticipantsExceeded(
  maxParticipants: number | null | undefined,
  currentParticipants: number,
  additionalParticipants: number
) {
  if (maxParticipants == null) return false;
  return currentParticipants + additionalParticipants > maxParticipants;
}

export function isMaxTeamsExceeded(
  maxTeams: number | null | undefined,
  currentTeams: number,
  additionalTeams = 1
) {
  if (maxTeams == null) return false;
  return currentTeams + additionalTeams > maxTeams;
}
