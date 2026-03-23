import crypto from "node:crypto";
import {
  EventParticipationMode,
  Prisma,
  PrismaClient,
  RegistrationSource,
  RegistrationSyncStatus,
  TeamMemberRole,
  TeamStatus,
} from "@prisma/client";
import { getEventParticipantCount, isMaxParticipantsExceeded, isMaxTeamsExceeded } from "@/server/services/capacity.service";
import { getActiveYear } from "@/lib/edition";

export function normalizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeName(name: string) {
  return name.trim().toUpperCase();
}

export function normalizeShacklesId(value: string) {
  return value.trim().toUpperCase();
}

export function parseUniqueShacklesIds(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeShacklesId(value))
        .filter((value) => value.length > 0)
    )
  );
}

export async function generateUniqueTeamCode(
  tx: {
    team: {
      findUnique: (args: {
        where: { eventId_teamCode: { eventId: string; teamCode: string } };
        select: { id: true };
      }) => Promise<{ id: string } | null>;
    };
  },
  eventId: string
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const existing = await tx.team.findUnique({
      where: {
        eventId_teamCode: {
          eventId,
          teamCode: code,
        },
      },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Unable to allocate a unique team code.");
}

type DbClient = Prisma.TransactionClient | PrismaClient;

export type TeamServiceFailure = {
  success: false;
  reason: string;
  error: string;
  details?: Record<string, unknown>;
};

export type TeamServiceSuccess = {
  success: true;
  message: string;
};

export type TeamServiceResult = TeamServiceSuccess | TeamServiceFailure;

export async function addMemberToTeamEvent(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  teamName: string;
  stationId: string;
  clientOperationId?: string;
  syncedAt?: Date;
}) : Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const normalizedTeam = normalizeTeamName(input.teamName);
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });
  if (!user) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  if (user.payment?.status !== "VERIFIED") {
    return { success: false, reason: "PAYMENT_NOT_VERIFIED", error: "Only verified users can be added to team events." };
  }

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
  });
  if (!event) {
    return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  }
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const existing = await input.db.eventRegistration.findUnique({
    where: {
      userId_eventId: {
        userId: input.userId,
        eventId: event.id,
      },
    },
  });
  if (existing) return { success: true, message: "Participant already in this event." };

  const participantCount = await getEventParticipantCount({
    db: input.db,
    eventId: event.id,
  });
  if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  let team = await input.db.team.findUnique({
    where: {
      eventId_nameNormalized: {
        eventId: event.id,
        nameNormalized: normalizedTeam,
      },
    },
  });

  if (!team) {
    const currentTeams = await input.db.team.count({ where: { eventId: event.id } });
    if (isMaxTeamsExceeded(event.maxTeams, currentTeams, 1)) {
      return { success: false, reason: "TEAM_SLOTS_FULL", error: "Team slots are full." };
    }

    team = await input.db.team.create({
      data: {
        eventId: event.id,
        name: input.teamName.trim(),
        nameNormalized: normalizedTeam,
        teamCode: await generateUniqueTeamCode(input.db, event.id),
        memberCount: 0,
        status: TeamStatus.DRAFT,
        leaderUserId: user.id,
        leaderContactPhoneSnapshot: user.phone,
        leaderContactEmailSnapshot: user.email,
      },
    });
  }

  if (team.status !== TeamStatus.DRAFT) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already locked." };
  }

  const maxTeamSize = event.teamMaxSize ?? 4;
  if (team.memberCount + 1 > maxTeamSize) {
    return {
      success: false,
      reason: "TEAM_SIZE_EXCEEDED",
      error: `Team can have at most ${maxTeamSize} members.`,
    };
  }

  await input.db.eventRegistration.create({
    data: {
      userId: user.id,
      eventId: event.id,
      teamId: team.id,
      teamName: team.name,
      teamSize: 1,
      memberRole: team.leaderUserId === user.id ? TeamMemberRole.LEADER : TeamMemberRole.MEMBER,
      attended: true,
      attendedAt: new Date(),
      source: RegistrationSource.ON_SPOT,
      syncStatus: RegistrationSyncStatus.APPLIED,
      stationId: input.stationId,
      ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
      ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
    },
  });

  await input.db.team.update({
    where: { id: team.id },
    data: {
      memberCount: {
        increment: 1,
      },
    },
  });

  return { success: true, message: `Added to team ${team.name} and marked present.` };
}

export async function bulkRegisterAndLockTeamByShacklesIds(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  shacklesIds: string[];
  leaderShacklesId: string;
  stationId: string;
  operationId?: string;
  syncedAt?: Date;
}) : Promise<TeamServiceResult> {
  return bulkRegisterTeamByShacklesIds({
    ...input,
    lockTeam: true,
    markAttended: true,
  });
}

export async function bulkRegisterTeamByShacklesIds(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  shacklesIds: string[];
  leaderShacklesId: string;
  stationId: string;
  operationId?: string;
  syncedAt?: Date;
  lockTeam?: boolean;
  markAttended?: boolean;
}) : Promise<TeamServiceResult> {
  const activeYear = getActiveYear();
  const shouldLockTeam = input.lockTeam ?? false;
  const shouldMarkAttended = input.markAttended ?? false;

  const normalizedTeam = normalizeTeamName(input.teamName || "");
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const normalizedIds = parseUniqueShacklesIds(Array.isArray(input.shacklesIds) ? input.shacklesIds : []);
  if (normalizedIds.length === 0) {
    return { success: false, reason: "INVALID_INPUT", error: "Enter at least one Shackles ID." };
  }

  const leaderShacklesId = normalizeShacklesId(input.leaderShacklesId || "");
  if (!leaderShacklesId) {
    return { success: false, reason: "INVALID_INPUT", error: "Select a team leader." };
  }

  if (!normalizedIds.includes(leaderShacklesId)) {
    return { success: false, reason: "INVALID_LEADER", error: "Leader Shackles ID must be part of entered team IDs." };
  }

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
  });
  if (!event) {
    return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  }
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const teamMinSize = event.teamMinSize ?? 2;
  const teamMaxSize = event.teamMaxSize ?? 4;

  if (normalizedIds.length > teamMaxSize) {
    return {
      success: false,
      reason: "TEAM_ABOVE_MAX_SIZE",
      error: `At most ${teamMaxSize} members are allowed for this event.`,
    };
  }

  const users = await input.db.user.findMany({
    where: { shacklesId: { in: normalizedIds } },
    include: { payment: true },
  });

  const userByShacklesId = new Map<string, (typeof users)[number]>();
  for (const user of users) {
    if (!user.shacklesId) continue;
    userByShacklesId.set(normalizeShacklesId(user.shacklesId), user);
  }

  const missingIds = normalizedIds.filter((id) => !userByShacklesId.has(id));
  if (missingIds.length > 0) {
    return {
      success: false,
      reason: "USER_NOT_FOUND",
      error: `Unknown Shackles ID(s): ${missingIds.join(", ")}`,
      details: { missingIds },
    };
  }

  const unpaidIds = normalizedIds.filter((id) => {
    const user = userByShacklesId.get(id);
    return !user || user.payment?.status !== "VERIFIED";
  });

  if (unpaidIds.length > 0) {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: `Payment not verified for: ${unpaidIds.join(", ")}`,
      details: { unpaidIds },
    };
  }

  const allUserIds = normalizedIds
    .map((id) => userByShacklesId.get(id)?.id)
    .filter((id): id is string => Boolean(id));

  const alreadyRegistered = await input.db.eventRegistration.findMany({
    where: {
      eventId: event.id,
      userId: { in: allUserIds },
    },
    include: {
      user: {
        select: {
          shacklesId: true,
        },
      },
    },
  });

  if (alreadyRegistered.length > 0) {
    const existingIds = alreadyRegistered
      .map((registration) => registration.user.shacklesId)
      .filter((id): id is string => Boolean(id));

    return {
      success: false,
      reason: "ALREADY_REGISTERED",
      error: `Already registered in this event: ${existingIds.join(", ")}`,
      details: { existingIds },
    };
  }

  const existingParticipantCount = await getEventParticipantCount({
    db: input.db,
    eventId: event.id,
  });

  if (isMaxParticipantsExceeded(event.maxParticipants, existingParticipantCount, normalizedIds.length)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  let team = await input.db.team.findUnique({
    where: {
      eventId_nameNormalized: {
        eventId: event.id,
        nameNormalized: normalizedTeam,
      },
    },
  });

  if (!team) {
    const currentTeams = await input.db.team.count({ where: { eventId: event.id } });
    if (isMaxTeamsExceeded(event.maxTeams, currentTeams, 1)) {
      return { success: false, reason: "TEAM_SLOTS_FULL", error: "Team slots are full." };
    }

    const leaderUser = userByShacklesId.get(leaderShacklesId);
    if (!leaderUser) {
      return { success: false, reason: "INVALID_LEADER", error: "Selected leader not found." };
    }

    team = await input.db.team.create({
      data: {
        eventId: event.id,
        name: input.teamName.trim(),
        nameNormalized: normalizedTeam,
        teamCode: await generateUniqueTeamCode(input.db, event.id),
        memberCount: 0,
        status: TeamStatus.DRAFT,
        leaderUserId: leaderUser.id,
        leaderContactPhoneSnapshot: leaderUser.phone,
        leaderContactEmailSnapshot: leaderUser.email,
      },
    });
  }

  if (team.status !== TeamStatus.DRAFT) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already locked." };
  }

  const existingTeamMembers = await input.db.eventRegistration.count({ where: { teamId: team.id } });
  const finalMemberCount = existingTeamMembers + normalizedIds.length;

  if (finalMemberCount > teamMaxSize) {
    return {
      success: false,
      reason: "TEAM_ABOVE_MAX_SIZE",
      error: `Team can have at most ${teamMaxSize} members.`,
    };
  }

  for (const shacklesId of normalizedIds) {
    const user = userByShacklesId.get(shacklesId);
    if (!user) continue;

    await input.db.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        teamId: team.id,
        teamName: team.name,
        teamSize: 1,
        memberRole: shacklesId === leaderShacklesId ? TeamMemberRole.LEADER : TeamMemberRole.MEMBER,
        attended: shouldMarkAttended,
        ...(shouldMarkAttended ? { attendedAt: new Date() } : {}),
        source: RegistrationSource.ON_SPOT,
        syncStatus: RegistrationSyncStatus.APPLIED,
        stationId: input.stationId,
        ...(input.operationId ? { clientOperationId: `${input.operationId}:${shacklesId}` } : {}),
        ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
      },
    });
  }

  const leaderUser = userByShacklesId.get(leaderShacklesId);
  if (!leaderUser) {
    return { success: false, reason: "INVALID_LEADER", error: "Selected leader not found." };
  }

  await input.db.eventRegistration.updateMany({
    where: { teamId: team.id },
    data: { memberRole: TeamMemberRole.MEMBER },
  });

  await input.db.eventRegistration.updateMany({
    where: {
      teamId: team.id,
      userId: leaderUser.id,
    },
    data: { memberRole: TeamMemberRole.LEADER },
  });

  const teamData: Prisma.TeamUpdateInput = {
    memberCount: finalMemberCount,
    leaderUserId: leaderUser.id,
    leaderContactPhoneSnapshot: leaderUser.phone,
    leaderContactEmailSnapshot: leaderUser.email,
  };

  if (shouldLockTeam) {
    if (finalMemberCount < teamMinSize) {
      return {
        success: false,
        reason: "TEAM_BELOW_MIN_SIZE",
        error: `At least ${teamMinSize} members are required to complete team registration.`,
      };
    }

    teamData.status = TeamStatus.LOCKED;
    teamData.lockedAt = new Date();
  }

  await input.db.team.update({
    where: { id: team.id },
    data: teamData,
  });

  if (!shouldLockTeam) {
    return {
      success: true,
      message: `Team ${team.name} updated with ${finalMemberCount} members. Attendance can be marked separately.`,
    };
  }

  return {
    success: true,
    message: `Team ${team.name} registered and locked with ${finalMemberCount} members.`,
  };
}

export async function completeExistingTeamRegistration(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  leaderUserId?: string;
}) : Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const normalizedTeam = normalizeTeamName(input.teamName);
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
  });
  if (!event) {
    return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  }
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const team = await input.db.team.findUnique({
    where: {
      eventId_nameNormalized: {
        eventId: event.id,
        nameNormalized: normalizedTeam,
      },
    },
    include: {
      members: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!team) return { success: false, reason: "TEAM_NOT_FOUND", error: "Team not found." };
  if (team.status !== TeamStatus.DRAFT) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already completed and locked." };
  }

  if (input.leaderUserId) {
    const proposedLeader = team.members.find((member) => member.userId === input.leaderUserId);
    if (!proposedLeader) {
      return { success: false, reason: "INVALID_LEADER", error: "Leader must be a member of this team." };
    }

    const leaderUser = await input.db.user.findUnique({ where: { id: input.leaderUserId } });
    if (!leaderUser) {
      return { success: false, reason: "INVALID_LEADER", error: "Leader user not found." };
    }

    await input.db.team.update({
      where: { id: team.id },
      data: {
        leaderUserId: input.leaderUserId,
        leaderContactPhoneSnapshot: leaderUser.phone,
        leaderContactEmailSnapshot: leaderUser.email,
      },
    });

    await input.db.eventRegistration.updateMany({
      where: { teamId: team.id },
      data: { memberRole: TeamMemberRole.MEMBER },
    });

    await input.db.eventRegistration.update({
      where: { id: proposedLeader.id },
      data: { memberRole: TeamMemberRole.LEADER },
    });
  }

  const refreshedMembers = await input.db.eventRegistration.findMany({
    where: { teamId: team.id },
    select: { userId: true },
  });

  const memberCount = refreshedMembers.length;
  const teamMinSize = event.teamMinSize ?? 2;
  const teamMaxSize = event.teamMaxSize ?? 4;
  if (memberCount < teamMinSize) {
    return {
      success: false,
      reason: "TEAM_BELOW_MIN_SIZE",
      error: `At least ${teamMinSize} members are required to complete team registration.`,
    };
  }
  if (memberCount > teamMaxSize) {
    return {
      success: false,
      reason: "TEAM_ABOVE_MAX_SIZE",
      error: `Team can have at most ${teamMaxSize} members.`,
    };
  }

  await input.db.team.update({
    where: { id: team.id },
    data: {
      status: TeamStatus.LOCKED,
      memberCount,
      lockedAt: new Date(),
    },
  });

  return { success: true, message: `Team ${team.name} registration completed.` };
}
