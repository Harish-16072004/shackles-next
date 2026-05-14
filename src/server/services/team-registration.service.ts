/**
 * team-registration.service.ts
 *
 * Self-service team registration primitives (items #1, #2, #3)
 * + refactored coordinator/bulk path (#6)
 *
 * Flow overview:
 *   Leader  → createTeam()        → team.status = OPEN, generates joinCode
 *   Members → joinTeamByCode()    → adds member if team OPEN and slot available
 *   Leader  → lockTeam()          → validates min size, status → LOCKED, clears joinCode
 *
 * Coordinator/kiosk path:
 *   bulkRegisterAndLockTeamByShacklesIds() now calls the three primitives above
 *   internally so all business rules stay in one place.
 */

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
import {
  getEventParticipantCount,
  isMaxParticipantsExceeded,
  isMaxTeamsExceeded,
} from "@/server/services/capacity.service";
import {
  getVerifiedPackage,
  canAccessEventCategory,
  ensureNoTimeClash,
  DomainError,
} from "@/server/services/registration-helpers.service";
import { getActiveYear } from "@/lib/edition";

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface TeamServiceResult {
  success: boolean;
  message?: string;
  error?: string;
  reason?: string;
  details?: any;
}

export function normalizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

export function validateTeamName(name: string, normalizedName: string): { isValid: boolean; error?: string; reason?: string } {
  const NAME_REGEX = /^[A-Z0-9 _-]{3,40}$/;
  
  if (!NAME_REGEX.test(normalizedName)) {
    return {
      isValid: false,
      reason: "INVALID_TEAM_NAME",
      error: "Team name must be 3-40 characters and contain only letters, numbers, spaces, hyphens or underscores."
    };
  }

  const bannedWords = ["TEST", "ADMIN", "FUCK", "SHIT", "DUMMY", "BITCH", "CUNT", "MODERATOR", "ROOT"];
  for (const word of bannedWords) {
    if (normalizedName.includes(word)) {
      return {
        isValid: false,
        reason: "INAPPROPRIATE_TEAM_NAME",
        error: "Please choose a professional team name."
      };
    }
  }

  return { isValid: true };
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
  tx: DbClient,
  eventId: string
): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 1, 0
  let code = "";
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 10) {
    code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(crypto.randomInt(0, chars.length));
    }

    const existing = await tx.team.findUnique({
      where: { eventId_teamCode: { eventId, teamCode: code } },
      select: { id: true },
    });

    if (!existing) {
      isUnique = true;
    }
    attempts++;
  }

  return code;
}

// ---------------------------------------------------------------------------
// Join Code generator (for team invite links)
// ---------------------------------------------------------------------------

export async function generateUniqueJoinCode(
  tx: DbClient,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = crypto.randomBytes(4).toString("hex").toUpperCase();
    const existing = await tx.team.findFirst({
      where: { joinCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  // Fallback: use a longer random string
  return crypto.randomBytes(8).toString("hex").toUpperCase();
}

// ---------------------------------------------------------------------------
// #1 — Leader creates a new team
// ---------------------------------------------------------------------------

export async function createTeam(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  leaderUserId: string;
}): Promise<TeamServiceResult & { teamId?: string; teamCode?: string }> {
  const activeYear = getActiveYear();
  const normalizedTeam = normalizeTeamName(input.teamName);

  const nameCheck = validateTeamName(input.teamName, normalizedTeam);
  if (!nameCheck.isValid) {
    return { success: false, reason: nameCheck.reason!, error: nameCheck.error! };
  }

  // 1. Resolve event and leader
  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
    select: { id: true, category: true, participationMode: true, maxTeams: true, maxParticipants: true },
  });

  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const leader = await input.db.user.findUnique({
    where: { id: input.leaderUserId },
    include: { payment: true },
  });

  if (!leader) return { success: false, reason: "USER_NOT_FOUND", error: "Leader not found." };

  // 2. Eligibility checks
  const payment = leader.payment;
  if (!payment || payment.status !== "VERIFIED" || payment.year !== activeYear || !payment.packageType) {
    return { success: false, reason: "NO_PACKAGE", error: "You must have a verified package for this year." };
  }
  if (!canAccessEventCategory(payment.packageType, event.category)) {
    return { success: false, reason: "PACKAGE_NOT_ALLOWED", error: "Your package doesn't allow registration for this event." };
  }

  // Already registered?
  const existingReg = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: leader.id, eventId: event.id } },
  });
  if (existingReg) return { success: false, reason: "ALREADY_REGISTERED", error: "You are already registered for this event." };

  // 3. Capacity checks
  const existingTeams = await input.db.team.count({ where: { eventId: event.id } });
  if (isMaxTeamsExceeded(event.maxTeams, existingTeams, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Registration is full for this event." };
  }

  // 4. Create team and leader registration
  const teamCode = await generateUniqueTeamCode(input.db, event.id);

  try {
    const team = await input.db.team.create({
      data: {
        eventId: event.id,
        name: input.teamName.trim(),
        nameNormalized: normalizedTeam,
        teamCode,
        status: TeamStatus.OPEN,
        memberCount: 1,
        leaderUserId: leader.id,
        leaderContactPhoneSnapshot: leader.phone,
        leaderContactEmailSnapshot: leader.email,
        members: {
          create: {
            userId: leader.id,
            eventId: event.id,
            memberRole: TeamMemberRole.LEADER,
            source: RegistrationSource.ONLINE,
            year: activeYear,
            teamName: input.teamName.trim(),
            teamSize: 1, // Will be updated on lock
          },
        },
      },
    });

    return { success: true, teamId: team.id, teamCode: team.teamCode, message: `Team ${team.name} created.` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { success: false, reason: "TEAM_EXISTS", error: "A team with this name already exists for this event." };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// #2 — Member joins a team via code
// ---------------------------------------------------------------------------

export async function joinTeamByCode(input: {
  db: DbClient;
  eventName: string;
  teamCode: string;
  userId: string;
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  // 1. Resolve event and team
  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
    },
    select: { id: true, category: true, participationMode: true, teamMaxSize: true, maxParticipants: true },
  });

  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };

  const team = await input.db.team.findUnique({
    where: { eventId_teamCode: { eventId: event.id, teamCode: input.teamCode.toUpperCase() } },
  });

  if (!team) return { success: false, reason: "TEAM_NOT_FOUND", error: "Invalid team code." };
  if (team.status !== TeamStatus.OPEN) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team registration is already completed and locked." };
  }

  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });

  if (!user) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };

  // 2. Eligibility checks
  const payment = user.payment;
  if (!payment || payment.status !== "VERIFIED" || payment.year !== activeYear || !payment.packageType) {
    return { success: false, reason: "NO_PACKAGE", error: "You must have a verified package for this year." };
  }
  if (!canAccessEventCategory(payment.packageType, event.category)) {
    return { success: false, reason: "PACKAGE_NOT_ALLOWED", error: "Your package doesn't allow registration for this event." };
  }

  const existingReg = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: user.id, eventId: event.id } },
  });
  if (existingReg) return { success: false, reason: "ALREADY_REGISTERED", error: "You are already registered for this event." };

  // 3. Capacity checks
  const maxTeamSize = event.teamMaxSize ?? 4;
  if (team.memberCount >= maxTeamSize) {
    return { success: false, reason: "TEAM_FULL", error: "This team is already full." };
  }

  const currentParticipantCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, currentParticipantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Registration is full for this event." };
  }

  // 4. Join team
  await input.db.eventRegistration.create({
    data: {
      userId: user.id,
      eventId: event.id,
      teamId: team.id,
      memberRole: TeamMemberRole.MEMBER,
      source: RegistrationSource.ONLINE,
      year: activeYear,
      teamName: team.name,
      teamSize: 1,
    },
  });

  // Increment memberCount. If it hits max, we COULD auto-lock, 
  // but usually we let the leader click "Lock" to confirm.
  await input.db.team.update({
    where: { id: team.id },
    data: { memberCount: { increment: 1 } },
  });

  return { success: true, message: `Joined team ${team.name} successfully.` };
}

// ---------------------------------------------------------------------------
// #3 — Leader locks/finalizes the team
// ---------------------------------------------------------------------------

/**
 * Finalize a team registration: validate min/max size, set status → LOCKED,
 * clear the join code so stale codes can't be used after finalization.
 * 
 * Uses optimistic locking (updateMany with status filter) to prevent
 * concurrent double-lock races.
 */
export async function lockTeam(input: {
  db: DbClient;
  teamId: string;
  /** Must be the team leader or an ADMIN/COORDINATOR user */
  requestingUserId: string;
}): Promise<
  TeamServiceResult & {
    teamName?: string;
    eventName?: string;
    memberCount?: number;
    members?: { userId: string; email: string; name: string; role: TeamMemberRole }[];
  }
> {
  const team = await input.db.team.findUnique({
    where: { id: input.teamId },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          teamMinSize: true,
          teamMaxSize: true,
          date: true,
          endDate: true,
          participationMode: true,
        },
      },
      members: {
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

  if (!team) return { success: false, reason: "TEAM_NOT_FOUND", error: "Team not found." };

  // Authorization: must be the leader or admin
  if (team.leaderUserId !== input.requestingUserId) {
    const requestor = await input.db.user.findUnique({
      where: { id: input.requestingUserId },
      select: { role: true },
    });
    const allowedRoles = ["ADMIN", "COORDINATOR"];
    if (!requestor || !allowedRoles.includes(requestor.role)) {
      return {
        success: false,
        reason: "UNAUTHORIZED",
        error: "Only the team leader or an admin can lock the team.",
      };
    }
  }

  if (team.status === TeamStatus.LOCKED) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already locked." };
  }
  if (team.status === TeamStatus.CANCELLED) {
    return { success: false, reason: "TEAM_CANCELLED", error: "Team has been cancelled." };
  }

  const teamMinSize = team.event.teamMinSize ?? 2;
  const teamMaxSize = team.event.teamMaxSize ?? 4;
  const memberCount = team.members.length;

  if (memberCount < teamMinSize) {
    return {
      success: false,
      reason: "TEAM_BELOW_MIN_SIZE",
      error: `At least ${teamMinSize} members are required to lock the team. Current: ${memberCount}.`,
    };
  }
  if (memberCount > teamMaxSize) {
    return {
      success: false,
      reason: "TEAM_ABOVE_MAX_SIZE",
      error: `Team can have at most ${teamMaxSize} members. Current: ${memberCount}.`,
    };
  }

  // Update teamSize on all registrations to the real count
  await input.db.eventRegistration.updateMany({
    where: { teamId: team.id },
    data: { teamSize: memberCount },
  });

  // Optimistic lock: only update if still OPEN (race-condition guard)
  const res = await input.db.team.updateMany({
    where: { id: team.id, status: TeamStatus.OPEN },
    data: {
      status: TeamStatus.LOCKED,
      memberCount,
      lockedAt: new Date(),
      lockedBy: input.requestingUserId,
      joinCode: null,
      joinCodeExpiresAt: null,
    },
  });

  if (res.count === 0) {
    return { success: false, reason: "ALREADY_LOCKED", error: "Team was locked by another user." };
  }

  return {
    success: true,
    message: `Team ${team.name} locked with ${memberCount} members.`,
    teamName: team.name,
    eventName: team.event.name,
    memberCount,
    members: team.members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: `${m.user.firstName} ${m.user.lastName}`,
      role: m.memberRole || TeamMemberRole.MEMBER,
    })),
  };
}

// ---------------------------------------------------------------------------
// #4 — Special: Mark Attendance for a single user (On-spot kiosk)
// ---------------------------------------------------------------------------

export async function markUserAttendanceOnSpot(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  stationId: string;
  syncedAt?: Date;
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
    },
    select: { id: true, name: true, participationMode: true, teamMaxSize: true },
  });

  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };

  const registration = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: input.userId, eventId: event.id } },
    include: { team: true },
  });

  if (!registration) {
    // If not registered, attempt to perform a quick individual on-spot registration 
    // IF the event allows individual participation.
    if (event.participationMode === EventParticipationMode.INDIVIDUAL) {
      return await input.db.eventRegistration.create({
        data: {
          userId: input.userId,
          eventId: event.id,
          attended: true,
          attendedAt: input.syncedAt || new Date(),
          source: RegistrationSource.ON_SPOT,
          year: activeYear,
          stationId: input.stationId,
        },
      }).then(() => ({ success: true, message: "Registered and marked present." }));
    }

    return { success: false, reason: "NOT_REGISTERED", error: "User is not registered for this event." };
  }

  if (registration.attended) {
    return { success: true, message: "User is already marked as present." };
  }

  await input.db.eventRegistration.update({
    where: { id: registration.id },
    data: {
      attended: true,
      attendedAt: input.syncedAt || new Date(),
      stationId: input.stationId,
    },
  });

  // If part of a team, we might need to update team stats or auto-lock?
  // Business rule: auto-lock team if all members are present AND team hits min size?
  // For now, we just mark the individual presence.

  return { success: true, message: "Attendance marked successfully." };
}

// ---------------------------------------------------------------------------
// #5 — Special: Join an existing team (On-spot kiosk search result)
// ---------------------------------------------------------------------------

export async function joinExistingTeamOnSpot(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  teamId: string;
  stationId: string;
  syncedAt?: Date;
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const performOnSpotRegister = async (tx: Prisma.TransactionClient) => {
    const event = await tx.event.findFirst({
      where: {
        name: { equals: normalizeName(input.eventName), mode: "insensitive" },
        year: activeYear,
        isActive: true,
      },
      select: { id: true, teamMaxSize: true, maxParticipants: true },
    });

    if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };

    const activeTeam = await tx.team.findUnique({
      where: { id: input.teamId },
    });

    if (!activeTeam) return { success: false, reason: "TEAM_NOT_FOUND", error: "Team not found." };
    if (activeTeam.status !== TeamStatus.OPEN) {
      return { success: false, reason: "TEAM_LOCKED", error: "This team is already locked." };
    }

    const maxTeamSize = event.teamMaxSize ?? 4;
    if (activeTeam.memberCount >= maxTeamSize) {
      return { success: false, reason: "TEAM_FULL", error: "Team is already full." };
    }

    // Is user already in this event?
    const existing = await tx.eventRegistration.findUnique({
      where: { userId_eventId: { userId: input.userId, eventId: event.id } },
    });
    if (existing) return { success: false, reason: "ALREADY_REGISTERED", error: "User already registered." };

    await tx.eventRegistration.create({
      data: {
        userId: input.userId,
        eventId: event.id,
        teamId: activeTeam.id,
        memberRole: TeamMemberRole.MEMBER,
        attended: true,
        attendedAt: input.syncedAt || new Date(),
        source: RegistrationSource.ON_SPOT,
        year: activeYear,
        stationId: input.stationId,
        teamName: activeTeam.name,
        teamSize: 1,
        syncStatus: RegistrationSyncStatus.APPLIED,
        ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
      },
    });

    const shouldAutoLock = activeTeam.memberCount + 1 === maxTeamSize;
    await tx.team.update({
      where: { id: activeTeam.id },
      data: { 
        memberCount: { increment: 1 },
        ...(shouldAutoLock ? { 
          status: TeamStatus.LOCKED,
          lockedAt: new Date(),
          joinCode: null,
          joinCodeExpiresAt: null
        } : {})
      },
    });

    return { success: true as const, message: `Added to team ${activeTeam.name} and marked present.` };
  };

  if ('$transaction' in input.db) {
    return await (input.db as any).$transaction(performOnSpotRegister);
  }
  return await performOnSpotRegister(input.db as Prisma.TransactionClient);
}

// ---------------------------------------------------------------------------
// #5b — Add a single member to a team event by userId (scanner flow)
// ---------------------------------------------------------------------------

export async function addMemberToTeamEvent(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  teamName: string;
  stationId: string;
  clientOperationId?: string;
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
    select: {
      id: true,
      name: true,
      participationMode: true,
      teamMinSize: true,
      teamMaxSize: true,
      maxParticipants: true,
      maxTeams: true,
    },
  });

  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });

  if (!user) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };

  if (user.payment?.status !== "VERIFIED" || user.payment?.year !== activeYear) {
    return { success: false, reason: "PAYMENT_NOT_VERIFIED", error: "User payment is not verified for the current year." };
  }

  // Check if already registered for this event
  const existingReg = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: user.id, eventId: event.id } },
  });
  if (existingReg) {
    return { success: false, reason: "ALREADY_REGISTERED", error: "User is already registered for this event." };
  }

  // Capacity check
  const currentCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, currentCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  // Find or create team
  const normalizedTeam = normalizeTeamName(input.teamName);
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  let team = await input.db.team.findUnique({
    where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
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
        status: TeamStatus.OPEN,
        leaderUserId: user.id,
        leaderContactPhoneSnapshot: user.phone,
        leaderContactEmailSnapshot: user.email,
      },
    });
  }

  if (team.status !== TeamStatus.OPEN) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already locked." };
  }

  const teamMaxSize = event.teamMaxSize ?? 4;
  if (team.memberCount >= teamMaxSize) {
    return { success: false, reason: "TEAM_FULL", error: "Team is already full." };
  }

  // Determine role: first member becomes leader
  const isLeader = team.memberCount === 0;
  const memberRole = isLeader ? TeamMemberRole.LEADER : TeamMemberRole.MEMBER;

  await input.db.eventRegistration.create({
    data: {
      userId: user.id,
      eventId: event.id,
      teamId: team.id,
      teamName: team.name,
      teamSize: 1,
      memberRole,
      attended: false,
      source: RegistrationSource.ON_SPOT,
      syncStatus: RegistrationSyncStatus.APPLIED,
      stationId: input.stationId,
      year: activeYear,
      ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
    },
  });

  await input.db.team.update({
    where: { id: team.id },
    data: { memberCount: { increment: 1 } },
  });

  return { success: true, message: `Added ${user.firstName} to team ${team.name}.` };
}

// ---------------------------------------------------------------------------
// #6 — Refactored bulkRegisterTeamByShacklesIds
// ---------------------------------------------------------------------------

export async function bulkRegisterAndLockTeamByShacklesIds(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  shacklesIds: string[];
  leaderShacklesId: string;
  stationId: string;
  operationId?: string;
  syncedAt?: Date;
}): Promise<TeamServiceResult> {
  return bulkRegisterTeamByShacklesIds({ ...input, lockTeam: true, markAttended: true });
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
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();
  const shouldLockTeam = input.lockTeam ?? false;
  const shouldMarkAttended = input.markAttended ?? false;

  const normalizedTeam = normalizeTeamName(input.teamName || "");
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const nameCheck = validateTeamName(input.teamName || "", normalizedTeam);
  if (!nameCheck.isValid) {
    return { success: false, reason: nameCheck.reason!, error: nameCheck.error! };
  }

  const normalizedIds = parseUniqueShacklesIds(
    Array.isArray(input.shacklesIds) ? input.shacklesIds : []
  );
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

  // Resolve all users by shacklesId
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

  const leaderUser = userByShacklesId.get(leaderShacklesId);
  if (!leaderUser) {
    return { success: false, reason: "INVALID_LEADER", error: "Selected leader not found." };
  }

  // Resolve event
  const event = await input.db.event.findFirst({
    where: {
      name: { equals: normalizeName(input.eventName), mode: "insensitive" },
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
    select: {
      id: true,
      name: true,
      category: true,
      participationMode: true,
      teamMinSize: true,
      teamMaxSize: true,
      maxTeams: true,
      maxParticipants: true,
    },
  });
  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
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

  // Payment checks
  const unpaidIds = normalizedIds.filter((id) => {
    const user = userByShacklesId.get(id);
    return !user || user.payment?.status !== "VERIFIED" || user.payment?.year !== activeYear;
  });
  if (unpaidIds.length > 0) {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: `Payment not verified for current year: ${unpaidIds.join(", ")}`,
      details: { unpaidIds },
    };
  }

  // Package checks
  for (const id of normalizedIds) {
    const user = userByShacklesId.get(id);
    if (!user) continue;
    const payment = user.payment;
    if (!payment || payment.status !== "VERIFIED" || payment.year !== activeYear || !payment.packageType) {
      return { success: false, reason: "NO_PACKAGE", error: `User ${id} has no verified package.` };
    }
    if (!canAccessEventCategory(payment.packageType, event.category)) {
      return {
        success: false,
        reason: "PACKAGE_NOT_ALLOWED",
        error: `User ${id} package does not allow registration for this event type.`,
      };
    }
  }

  // Time clash checks (skip for on-spot attended)
  if (!shouldMarkAttended) {
    for (const id of normalizedIds) {
      const user = userByShacklesId.get(id);
      if (!user) continue;
      try {
        await ensureNoTimeClash(input.db, user.id, event.id, activeYear);
      } catch (err) {
        if (err instanceof DomainError) {
          return {
            success: false,
            reason: err.code,
            error: `User ${id} has a time conflict: ${err.message}`,
            details: err.details,
          };
        }
        throw err;
      }
    }
  }

  const allUserIds = normalizedIds
    .map((id) => userByShacklesId.get(id)?.id)
    .filter((id): id is string => Boolean(id));

  const alreadyRegistered = await input.db.eventRegistration.findMany({
    where: { eventId: event.id, userId: { in: allUserIds } },
    include: { user: { select: { shacklesId: true } } },
  });
  if (alreadyRegistered.length > 0) {
    const existingIds = alreadyRegistered
      .map((r) => r.user.shacklesId)
      .filter((id): id is string => Boolean(id));
    return {
      success: false,
      reason: "ALREADY_REGISTERED",
      error: `Already registered in this event: ${existingIds.join(", ")}`,
      details: { existingIds },
    };
  }

  const existingParticipantCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, existingParticipantCount, normalizedIds.length)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  // Find or create team
  let team = await input.db.team.findUnique({
    where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
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
        status: TeamStatus.OPEN,
        leaderUserId: leaderUser.id,
        leaderContactPhoneSnapshot: leaderUser.phone,
        leaderContactEmailSnapshot: leaderUser.email,
      },
    });
  }

  if (team.status !== TeamStatus.OPEN) {
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

  // Register all members
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
        year: activeYear,
        ...(input.operationId ? { clientOperationId: `${input.operationId}:${shacklesId}` } : {}),
        ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
      },
    });
  }

  const mustLock = shouldLockTeam || finalMemberCount === teamMaxSize;

  if (mustLock) {
    if (shouldLockTeam && finalMemberCount < teamMinSize) {
      return {
        success: false,
        reason: "TEAM_BELOW_MIN_SIZE",
        error: `At least ${teamMinSize} members are required to complete team registration.`,
      };
    }
    // updateMany only accepts scalar fields, not relations
    const res = await input.db.team.updateMany({
      where: { id: team.id, status: TeamStatus.OPEN },
      data: {
        leaderUserId: leaderUser.id,
        leaderContactPhoneSnapshot: leaderUser.phone,
        leaderContactEmailSnapshot: leaderUser.email,
        memberCount: finalMemberCount,
        status: TeamStatus.LOCKED,
        lockedAt: new Date(),
        lockedBy: leaderUser.id,
        joinCode: null,
        joinCodeExpiresAt: null,
      },
    });
    if (res.count === 0) {
      return { success: false, reason: "TEAM_LOCKED", error: "Team was locked by another process." };
    }
  } else {
    await input.db.team.update({
      where: { id: team.id },
      data: {
        leader: { connect: { id: leaderUser.id } },
        leaderContactPhoneSnapshot: leaderUser.phone,
        leaderContactEmailSnapshot: leaderUser.email,
        memberCount: finalMemberCount,
      },
    });
  }


  if (!mustLock) {
    return {
      success: true as const,
      message: `Team ${team.name} updated with ${finalMemberCount} members.`,
    };
  }

  return {
    success: true as const,
    message: `Team ${team.name} registered and locked with ${finalMemberCount} members.`,
  };
}

// ---------------------------------------------------------------------------
// completeExistingTeamRegistration (unchanged logic, kept for compatibility)
// ---------------------------------------------------------------------------

export async function completeExistingTeamRegistration(input: {
  db: DbClient;
  eventName: string;
  teamName: string;
  leaderUserId?: string;
}): Promise<TeamServiceResult> {
  const activeYear = getActiveYear();

  const normalizedTeam = normalizeTeamName(input.teamName);
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const nameCheck = validateTeamName(input.teamName, normalizedTeam);
  if (!nameCheck.isValid) {
    return { success: false, reason: nameCheck.reason!, error: nameCheck.error! };
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
  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const team = await input.db.team.findUnique({
    where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
    include: { members: { select: { id: true, userId: true } } },
  });

  if (!team) return { success: false, reason: "TEAM_NOT_FOUND", error: "Team not found." };
  if (team.status !== TeamStatus.OPEN) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already locked." };
  }

  const teamMinSize = event.teamMinSize ?? 2;
  const memberCount = team.members.length;

  if (memberCount < teamMinSize) {
    return {
      success: false,
      reason: "TEAM_BELOW_MIN_SIZE",
      error: `At least ${teamMinSize} members are required to complete registration.`,
    };
  }

  // Lock it
  await input.db.team.update({
    where: { id: team.id },
    data: {
      status: TeamStatus.LOCKED,
      lockedAt: new Date(),
      lockedBy: input.leaderUserId || team.leaderUserId,
      joinCode: null,
      joinCodeExpiresAt: null,
    },
  });

  return { success: true, message: `Team ${team.name} registered and locked.` };
}
