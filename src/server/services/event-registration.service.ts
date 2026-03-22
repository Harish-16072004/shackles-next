import { Prisma, PrismaClient, RegistrationSource, RegistrationSyncStatus } from "@prisma/client";
import { getEventParticipantCount, isMaxParticipantsExceeded, isMaxTeamsExceeded } from "@/server/services/capacity.service";
import { normalizeName } from "@/server/services/team-registration.service";

type DbClient = Prisma.TransactionClient | PrismaClient;

export type EventRegistrationServiceResult =
  | { success: true; message: string }
  | { success: false; reason: string; error: string; details?: Record<string, unknown> };

export async function quickRegisterAndMarkAttendance(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  stationId: string;
  clientOperationId?: string;
  syncedAt?: Date;
  teamEventMessage?: string;
  successMessage?: string;
}): Promise<EventRegistrationServiceResult> {
  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });

  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  }

  if (user.payment?.status !== "VERIFIED") {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: "Only verified users can be registered.",
    };
  }

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      isActive: true,
    },
  });

  if (!event) {
    return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  }

  if (event.participationMode === "TEAM") {
    return {
      success: false,
      reason: "TEAM_EVENT_USE_TEAM_ADD",
      error: input.teamEventMessage || "Team events require team flow.",
    };
  }

  const existing = await input.db.eventRegistration.findUnique({
    where: {
      userId_eventId: {
        userId: user.id,
        eventId: event.id,
      },
    },
  });

  if (existing) {
    return { success: true, message: "Already registered." };
  }

  const registeredTeams = await input.db.eventRegistration.count({ where: { eventId: event.id } });
  if (isMaxTeamsExceeded(event.maxTeams, registeredTeams, 1)) {
    return { success: false, reason: "TEAM_SLOTS_FULL", error: "Team slots are full." };
  }

  const participantCount = await getEventParticipantCount({
    db: input.db,
    eventId: event.id,
  });

  if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  await input.db.eventRegistration.create({
    data: {
      userId: user.id,
      eventId: event.id,
      teamSize: 1,
      attended: true,
      attendedAt: new Date(),
      source: RegistrationSource.ON_SPOT,
      syncStatus: RegistrationSyncStatus.APPLIED,
      stationId: input.stationId,
      ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
      ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
    },
  });

  return {
    success: true,
    message: input.successMessage || `Successfully registered & marked present for ${input.eventName}`,
  };
}
