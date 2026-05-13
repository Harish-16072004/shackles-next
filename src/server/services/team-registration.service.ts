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
// Helpers
// ---------------------------------------------------------------------------

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
      where: { eventId_teamCode: { eventId, teamCode: code } },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Unable to allocate a unique team code.");
}

/**
 * Generate a short, URL-safe join code (8 uppercase alphanumeric chars).
 * Globally unique across all teams.
 */
export async function generateUniqueJoinCode(db: DbClient): Promise<string> {
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I ambiguity
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let code = "";
    const bytes = crypto.randomBytes(8);
    for (let i = 0; i < 8; i++) {
      code += CHARS[bytes[i] % CHARS.length];
    }
    const existing = await db.team.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("Unable to allocate a unique join code.");
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

// ---------------------------------------------------------------------------
// #1 — createTeam()
// ---------------------------------------------------------------------------

/**
 * Self-service: the leader creates an OPEN team for a team event.
 * Returns joinCode + teamCode on success so they can be shared or emailed.
 */
export async function createTeam(input: {
  db: DbClient;
  /** userId from session — must be a verified, paid participant */
  leaderUserId: string;
  eventId: string;
  teamName: string;
  /** Optional: tie the join code to a deadline */
  joinCodeExpiresAt?: Date;
}): Promise<TeamServiceResult & { teamCode?: string; joinCode?: string }> {
  const activeYear = getActiveYear();

  const normalizedTeam = normalizeTeamName(input.teamName);
  if (!normalizedTeam) {
    return { success: false, reason: "INVALID_INPUT", error: "Team name is required." };
  }

  const nameCheck = validateTeamName(input.teamName, normalizedTeam);
  if (!nameCheck.isValid) {
    return { success: false, reason: nameCheck.reason!, error: nameCheck.error! };
  }

  // Validate leader
  const leader = await input.db.user.findUnique({
    where: { id: input.leaderUserId },
    include: { payment: true },
  });
  if (!leader) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  if (
    !leader.payment ||
    leader.payment.status !== "VERIFIED" ||
    leader.payment.year !== activeYear
  ) {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: "Payment not verified for the current year.",
    };
  }

  // Validate event
  const event = await input.db.event.findFirst({
    where: {
      id: input.eventId,
      year: activeYear,
      isActive: true,
      isArchived: false,
      isTemplate: false,
    },
    select: {
      id: true,
      name: true,
      participationMode: true,
      category: true,
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

  // Package eligibility
  const pkg = await getVerifiedPackage(input.db, input.leaderUserId, activeYear);
  if (!pkg) return { success: false, reason: "NO_PACKAGE", error: "No verified package found." };
  if (!canAccessEventCategory(pkg.packageType, event.category)) {
    return {
      success: false,
      reason: "PACKAGE_NOT_ALLOWED",
      error: "Your package does not allow registration for this event type.",
    };
  }

  // Already registered?
  const alreadyIn = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: input.leaderUserId, eventId: event.id } },
  });
  if (alreadyIn) {
    return { success: false, reason: "ALREADY_REGISTERED", error: "You are already registered for this event." };
  }

  // Capacity checks
  const participantCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  const performTeamCreation = async (tx: Prisma.TransactionClient) => {
    // Unique team name check inside transaction
    const existingTeam = await tx.team.findUnique({
      where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
    });
    if (existingTeam) {
      throw new Error("A team with this name already exists for this event.");
    }

    const currentTeams = await tx.team.count({ where: { eventId: event.id } });
    if (isMaxTeamsExceeded(event.maxTeams, currentTeams, 1)) {
      throw new Error("Team slots are full for this event.");
    }

    const teamCode = await generateUniqueTeamCode(tx, event.id);
    const joinCode = await generateUniqueJoinCode(tx);

    const team = await tx.team.create({
      data: {
        eventId: event.id,
        name: input.teamName.trim(),
        nameNormalized: normalizedTeam,
        teamCode,
        joinCode,
        joinCodeExpiresAt: input.joinCodeExpiresAt ?? null,
        memberCount: 1,
        status: TeamStatus.OPEN,
        leaderUserId: leader.id,
        leaderContactPhoneSnapshot: leader.phone,
        leaderContactEmailSnapshot: leader.email,
      },
    });

    await tx.eventRegistration.create({
      data: {
        userId: leader.id,
        eventId: event.id,
        teamId: team.id,
        teamName: team.name,
        teamSize: 1,
        memberRole: TeamMemberRole.LEADER,
        attended: false,
        source: RegistrationSource.ONLINE,
        syncStatus: RegistrationSyncStatus.APPLIED,
        year: activeYear,
      },
    });

    return { 
      success: true as const, 
      message: `Team ${team.name} created successfully.`,
      teamId: team.id, 
      joinCode: team.joinCode || undefined
    };
  };

  if ('$transaction' in input.db) {
    return await (input.db as any).$transaction(performTeamCreation);
  }
  return await performTeamCreation(input.db as Prisma.TransactionClient);
}

// ---------------------------------------------------------------------------
// #2 — joinTeamByCode()
// ---------------------------------------------------------------------------

/**
 * Self-service: a participant joins an OPEN team using the join code.
 * Idempotent — joining the same team twice returns success without error.
 */
export async function joinTeamByCode(input: {
  db: DbClient;
  /** userId from session */
  userId: string;
  joinCode: string;
}): Promise<TeamServiceResult & { teamName?: string; eventName?: string }> {
  const activeYear = getActiveYear();
  const normalizedCode = input.joinCode.trim().toUpperCase();

  if (!normalizedCode) {
    return { success: false, reason: "INVALID_INPUT", error: "Join code is required." };
  }

  // Resolve team via join code
  const team = await input.db.team.findUnique({
    where: { joinCode: normalizedCode },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          participationMode: true,
          category: true,
          teamMaxSize: true,
          maxParticipants: true,
          isActive: true,
          isArchived: true,
          isTemplate: true,
          year: true,
        },
      },
    },
  });

  if (!team) {
    return { success: false, reason: "INVALID_JOIN_CODE", error: "Invalid or expired join code." };
  }

  // Expiry check
  if (team.joinCodeExpiresAt && team.joinCodeExpiresAt < new Date()) {
    return { success: false, reason: "JOIN_CODE_EXPIRED", error: "This join code has expired." };
  }

  const event = team.event;
  if (!event.isActive || event.isArchived || event.isTemplate || event.year !== activeYear) {
    return { success: false, reason: "EVENT_NOT_AVAILABLE", error: "This event is no longer accepting registrations." };
  }

  if (team.status !== TeamStatus.OPEN) {
    return { success: false, reason: "TEAM_LOCKED", error: "This team is no longer accepting new members." };
  }

  // Validate joining user
  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });
  if (!user) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  if (
    !user.payment ||
    user.payment.status !== "VERIFIED" ||
    user.payment.year !== activeYear
  ) {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: "Payment not verified for the current year.",
    };
  }

  // Package eligibility
  const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
  if (!pkg) return { success: false, reason: "NO_PACKAGE", error: "No verified package found." };
  if (!canAccessEventCategory(pkg.packageType, event.category)) {
    return {
      success: false,
      reason: "PACKAGE_NOT_ALLOWED",
      error: "Your package does not allow registration for this event type.",
    };
  }

  // Idempotency: already in this event?
  const existing = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: input.userId, eventId: event.id } },
  });
  if (existing) {
    return {
      success: true as const,
      message: "You are already registered for this event.",
      teamName: team.name,
      eventName: event.name,
    };
  }

  // Capacity checks
  const participantCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  const teamMaxSize = event.teamMaxSize ?? 4;
  if (team.memberCount + 1 > teamMaxSize) {
    return {
      success: false,
      reason: "TEAM_SIZE_EXCEEDED",
      error: `Team already has the maximum number of members (${teamMaxSize}).`,
    };
  }

  // Time clash
  try {
    await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);
  } catch (err) {
    if (err instanceof DomainError) {
      return { success: false, reason: err.code, error: err.message };
    }
    throw err;
  }

  const performJoin = async (tx: Prisma.TransactionClient) => {
    // 9. Re-check capacity inside transaction
    const freshTeam = await tx.team.findUnique({
      where: { id: team.id },
      select: { memberCount: true, status: true },
    });

    if (!freshTeam || freshTeam.status !== TeamStatus.OPEN) {
      throw new Error("Team is no longer accepting new members.");
    }

    if (freshTeam.memberCount + 1 > teamMaxSize) {
      throw new Error(`Team is already full (${teamMaxSize}).`);
    }

    // 10. Register
    await tx.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        teamId: team.id,
        teamName: team.name,
        teamSize: 1,
        memberRole: TeamMemberRole.MEMBER,
        attended: false,
        source: RegistrationSource.ONLINE,
        syncStatus: RegistrationSyncStatus.APPLIED,
        year: activeYear,
      },
    });

    // 11. Atomic increment with capacity guard
    const shouldLock = freshTeam.memberCount + 1 === teamMaxSize;
    await tx.team.update({
      where: { id: team.id },
      data: { 
        memberCount: { increment: 1 },
        ...(shouldLock ? { 
          status: TeamStatus.LOCKED,
          lockedAt: new Date(),
          joinCode: null,
          joinCodeExpiresAt: null
        } : {})
      },
    });

    return {
      success: true as const,
      message: `Successfully joined team ${team.name} for ${event.name}.`,
      teamName: team.name,
      eventName: event.name,
    };
  };

  const client = input.db as any;
  if ('$transaction' in client) {
    return await client.$transaction(performJoin);
  }
  return await performJoin(input.db as Prisma.TransactionClient);
}

// ---------------------------------------------------------------------------
// #3 — lockTeam()
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

  // Optimistic lock: only update if still OPEN/DRAFT (race-condition guard)
  const res = await input.db.team.updateMany({
    where: { id: team.id, status: TeamStatus.OPEN },
    data: {
      status: TeamStatus.LOCKED,
      memberCount,
      lockedAt: new Date(),
      lockedBy: input.requestingUserId,
      joinCode: null,             // clear join code after locking
      joinCodeExpiresAt: null,
    },
  });

  if (res.count === 0) {
    return { success: false, reason: "TEAM_LOCKED", error: "Team was locked by another process." };
  }

  const members = team.members.map((reg) => ({
    userId: reg.user.id,
    email: reg.user.email,
    name: `${reg.user.firstName} ${reg.user.lastName}`,
    role: reg.memberRole ?? TeamMemberRole.MEMBER,
  }));

  return {
    success: true as const,
    message: `Team ${team.name} is now locked with ${memberCount} members.`,
    teamName: team.name,
    eventName: team.event.name,
    memberCount,
    members,
  };
}

// ---------------------------------------------------------------------------
// #6 — Refactored addMemberToTeamEvent (unchanged API, uses OPEN status)
// ---------------------------------------------------------------------------

export async function addMemberToTeamEvent(input: {
  db: DbClient;
  userId: string;
  eventName: string;
  teamName: string;
  stationId: string;
  clientOperationId?: string;
  syncedAt?: Date;
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

  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });
  if (!user) return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  if (!user.payment || user.payment.status !== "VERIFIED" || user.payment.year !== activeYear) {
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
    select: {
      id: true,
      name: true,
      participationMode: true,
      category: true,
      teamMaxSize: true,
      maxParticipants: true,
      maxTeams: true,
    },
  });
  if (!event) return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
  if (event.participationMode !== EventParticipationMode.TEAM) {
    return { success: false, reason: "NOT_TEAM_EVENT", error: "This event is not a team event." };
  }

  const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
  if (!pkg) return { success: false, reason: "NO_PACKAGE", error: "No verified package found." };
  if (!canAccessEventCategory(pkg.packageType, event.category)) {
    return { success: false, reason: "PACKAGE_NOT_ALLOWED", error: "Your package does not allow registration for this event type." };
  }

  try {
    await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);
  } catch (err) {
    if (err instanceof DomainError) {
      return { success: false, reason: err.code, error: err.message };
    }
    throw err;
  }

  const existing = await input.db.eventRegistration.findUnique({
    where: { userId_eventId: { userId: input.userId, eventId: event.id } },
  });
  if (existing) return { success: true as const, message: "Participant already in this event." };

  const participantCount = await getEventParticipantCount({ db: input.db, eventId: event.id });
  if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
    return { success: false, reason: "CAPACITY_FULL", error: "Event is full." };
  }

  let team = await input.db.team.findUnique({
    where: { eventId_nameNormalized: { eventId: event.id, nameNormalized: normalizedTeam } },
  });

  const performOnSpotRegister = async (tx: Prisma.TransactionClient) => {
    let activeTeam = team;

    if (!activeTeam) {
      const currentTeams = await tx.team.count({ where: { eventId: event.id } });
      if (isMaxTeamsExceeded(event.maxTeams, currentTeams, 1)) {
        throw new Error("Team slots are full.");
      }

      activeTeam = await tx.team.create({
        data: {
          eventId: event.id,
          name: input.teamName.trim(),
          nameNormalized: normalizedTeam,
          teamCode: await generateUniqueTeamCode(tx, event.id),
          memberCount: 0,
          status: TeamStatus.OPEN,
          leaderUserId: user.id,
          leaderContactPhoneSnapshot: user.phone,
          leaderContactEmailSnapshot: user.email,
        },
      });
    }

    if (!activeTeam) throw new Error("Failed to resolve team.");

    if (activeTeam.status !== TeamStatus.OPEN) {
      throw new Error("Team is already locked.");
    }

    const maxTeamSize = event.teamMaxSize ?? 4;
    if (activeTeam.memberCount + 1 > maxTeamSize) {
      throw new Error(`Team can have at most ${maxTeamSize} members.`);
    }

    await tx.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        teamId: activeTeam.id,
        teamName: activeTeam.name,
        teamSize: 1,
        memberRole: activeTeam.leaderUserId === user.id ? TeamMemberRole.LEADER : TeamMemberRole.MEMBER,
        attended: true,
        attendedAt: new Date(),
        source: RegistrationSource.ON_SPOT,
        syncStatus: RegistrationSyncStatus.APPLIED,
        stationId: input.stationId,
        year: activeYear,
        ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
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
// #6 — Refactored bulkRegisterAndLockTeamByShacklesIds
//       Now built on top of the three self-service primitives.
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

  // Package checks — uses already-fetched user.payment data (loaded with include: { payment: true })
  for (const id of normalizedIds) {
    const user = userByShacklesId.get(id);
    if (!user) continue;
    const payment = user.payment;
    if (!payment || payment.status !== "VERIFIED" || payment.year !== activeYear || !payment.packageType) {
      return { success: false, reason: "NO_PACKAGE", error: `User ${id} has no verified package.` };
    }
    if (!canAccessEventCategory(payment.packageType as Parameters<typeof canAccessEventCategory>[0], event.category)) {
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

  const teamData: Record<string, unknown> = {
    leaderUserId: leaderUser.id,
    leaderContactPhoneSnapshot: leaderUser.phone,
    leaderContactEmailSnapshot: leaderUser.email,
    memberCount: finalMemberCount,
  };

  const mustLock = shouldLockTeam || finalMemberCount === teamMaxSize;

  if (mustLock) {
    if (shouldLockTeam && finalMemberCount < teamMinSize) {
      return {
        success: false,
        reason: "TEAM_BELOW_MIN_SIZE",
        error: `At least ${teamMinSize} members are required to complete team registration.`,
      };
    }
    teamData.status = TeamStatus.LOCKED;
    teamData.lockedAt = new Date();
    teamData.lockedBy = leaderUser.id;
    teamData.joinCode = null;
    teamData.joinCodeExpiresAt = null;
  }

  if (mustLock) {
    const res = await input.db.team.updateMany({
      where: { id: team.id, status: TeamStatus.OPEN },
      data: teamData,
    });
    if (res.count === 0) {
      return { success: false, reason: "TEAM_LOCKED", error: "Team was locked by another process." };
    }
  } else {
    await input.db.team.update({ where: { id: team.id }, data: teamData });
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
    return { success: false, reason: "TEAM_LOCKED", error: "Team is already completed and locked." };
  }

  if (input.leaderUserId) {
    const proposedLeader = team.members.find((m) => m.userId === input.leaderUserId);
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
      joinCode: null,
      joinCodeExpiresAt: null,
    },
  });

  return { success: true, message: `Team ${team.name} registration completed.` };
}
