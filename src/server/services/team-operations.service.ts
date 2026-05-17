/**
 * Team Operations Service
 * Handles:
 * - Team creation with join codes
 * - Member joining via join codes
 * - Team locking with validation
 */

import {
  EventParticipationMode,
  PrismaClient,
  TeamMemberRole,
  TeamStatus,
  RegistrationSource,
  RegistrationSyncStatus,
} from "@prisma/client";
import { getActiveYear } from "@/lib/edition";
import {
  getVerifiedPackage,
  canAccessEventCategory,
  ensureNoTimeClash,
  generateJoinCode,
  validateTeamSize,
  DomainError,
} from "@/server/services/registration-helpers.service";
import {
  sendTeamCreatedEmail,
  sendTeamLockedEmail,
} from "@/server/services/email.service";
import { generateUniqueTeamCode, normalizeTeamName } from "@/server/services/team-registration.service";

type DbClient = PrismaClient;

export interface CreateTeamInput {
  userId: string;
  eventId: string;
  teamName: string;
  db: DbClient;
}

export interface CreateTeamResult {
  success: boolean;
  teamId?: string;
  joinCode?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Create a new team for an event and register the leader
 */
export async function createTeamForEvent(input: CreateTeamInput): Promise<CreateTeamResult> {
  const activeYear = getActiveYear();

  try {
    // 1. Verify user and payment
    const user = await input.db.user.findUnique({
      where: { id: input.userId },
      include: { payment: true },
    });

    if (!user) {
      throw new DomainError("USER_NOT_FOUND", "User not found");
    }

    if (!user.payment || user.payment.status !== "VERIFIED" || user.payment.year !== activeYear) {
      throw new DomainError(
        "PAYMENT_NOT_VERIFIED",
        "Payment must be verified for the active year before creating a team"
      );
    }

    // 2. Fetch event and validate
    const event = await input.db.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        name: true,
        year: true,
        participationMode: true,
        category: true,
        isActive: true,
        isArchived: true,
        isTemplate: true,
        date: true,
        endDate: true,
        allDay: true,
        teamMinSize: true,
        teamMaxSize: true,
      },
    });

    if (!event) {
      throw new DomainError("EVENT_NOT_FOUND", "Event not found");
    }

    if (event.year !== activeYear) {
      throw new DomainError("EVENT_WRONG_YEAR", "Event is not in the active year");
    }

    if (!event.isActive || event.isArchived || event.isTemplate) {
      throw new DomainError("EVENT_INVALID_STATE", "Event is not available for registration");
    }

    if (event.participationMode !== EventParticipationMode.TEAM) {
      throw new DomainError("NOT_TEAM_EVENT", "This event does not allow team participation");
    }

    // 3. Check package eligibility
    const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
    if (!pkg) {
      throw new DomainError("NO_VERIFIED_PACKAGE", "No verified package found");
    }

    if (!canAccessEventCategory(pkg.packageType, event.category)) {
      throw new DomainError(
        "PACKAGE_NOT_ALLOWED",
        `Your package (${pkg.packageType}) does not allow registration for ${event.category} events`
      );
    }

    // 4. Check for time clash
    await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);

    // 5. Check if user is already registered for this event
    const existing = await input.db.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: input.userId,
          eventId: event.id,
        },
      },
    });

    if (existing) {
      throw new DomainError(
        "ALREADY_REGISTERED",
        "You are already registered for this event"
      );
    }

    // 6. Generate unique team code and join code
    const teamCode = await generateUniqueTeamCode(input.db, event.id);
    const joinCode = generateJoinCode();
    const normalizedName = normalizeTeamName(input.teamName);

    // 7. Create team and register leader in a transaction
    const result = await input.db.$transaction(async (tx) => {
      // Check for duplicate team name
      const existingTeam = await tx.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: normalizedName,
          },
        },
      });

      if (existingTeam) {
        throw new DomainError("TEAM_NAME_EXISTS", "A team with this name already exists");
      }

      // Create the team
      const team = await tx.team.create({
        data: {
          eventId: event.id,
          name: input.teamName,
          nameNormalized: normalizedName,
          teamCode,
          joinCode,
          status: TeamStatus.OPEN,
          leaderUserId: input.userId,
          memberCount: 1,
        },
      });

      // Register leader as team member
      await tx.eventRegistration.create({
        data: {
          userId: input.userId,
          eventId: event.id,
          teamId: team.id,
          memberRole: TeamMemberRole.LEADER,
          teamName: input.teamName,
          teamSize: 1, // Will be updated when team is locked
          source: RegistrationSource.ONLINE,
          syncStatus: RegistrationSyncStatus.APPLIED,
          year: activeYear,
        },
      });

      return team;
    });

    // 8. Send email to leader
    const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL}/events/${event.id}/join-team?code=${joinCode}`;
    await sendTeamCreatedEmail({
      leaderEmail: user.email,
      leaderName: user.firstName,
      teamName: input.teamName,
      eventName: event.name,
      joinCode,
      joinUrl,
      teamCode: result.teamCode,
    });

    return {
      success: true,
      teamId: result.id,
      joinCode,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: err.message,
        details: err.details,
      };
    }

    console.error("Error creating team:", err);
    return {
      success: false,
      error: "Failed to create team",
      details: { cause: String(err) },
    };
  }
}

export interface JoinTeamInput {
  userId: string;
  joinCode: string;
  db: DbClient;
}

export interface JoinTeamResult {
  success: boolean;
  teamId?: string;
  eventId?: string;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Join a team by join code
 */
export async function joinTeamByCode(input: JoinTeamInput): Promise<JoinTeamResult> {
  const activeYear = getActiveYear();

  try {
    // 1. Verify user and payment
    const user = await input.db.user.findUnique({
      where: { id: input.userId },
      include: { payment: true },
    });

    if (!user) {
      throw new DomainError("USER_NOT_FOUND", "User not found");
    }

    if (!user.payment || user.payment.status !== "VERIFIED" || user.payment.year !== activeYear) {
      throw new DomainError(
        "PAYMENT_NOT_VERIFIED",
        "Payment must be verified for the active year to join a team"
      );
    }

    // 2. Find team by join code
    const team = await input.db.team.findUnique({
      where: { joinCode: input.joinCode },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            year: true,
            isActive: true,
            isArchived: true,
            isTemplate: true,
            category: true,
            participationMode: true,
            date: true,
            endDate: true,
            allDay: true,
            teamMaxSize: true,
          },
        },
      },
    });

    if (!team) {
      throw new DomainError("JOIN_CODE_INVALID", "Invalid join code");
    }

    // 3. Validate team state
    if (team.status !== TeamStatus.OPEN) {
      throw new DomainError(
        "TEAM_NOT_OPEN",
        `Team status is ${team.status}, cannot join`
      );
    }

    // 4. Validate event
    const event = team.event;
    if (event.year !== activeYear) {
      throw new DomainError("EVENT_WRONG_YEAR", "Event is not in the active year");
    }

    if (!event.isActive || event.isArchived || event.isTemplate) {
      throw new DomainError("EVENT_INVALID_STATE", "Event is not available");
    }

    // 5. Check package eligibility
    const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
    if (!pkg) {
      throw new DomainError("NO_VERIFIED_PACKAGE", "No verified package found");
    }

    if (!canAccessEventCategory(pkg.packageType, event.category)) {
      throw new DomainError(
        "PACKAGE_NOT_ALLOWED",
        `Your package does not allow registration for ${event.category} events`
      );
    }

    // 6. Check for time clash
    await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);

    // 7. Check if already registered for this event
    const existing = await input.db.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: input.userId,
          eventId: event.id,
        },
      },
    });

    if (existing) {
      throw new DomainError(
        "ALREADY_REGISTERED",
        "You are already registered for this event"
      );
    }

    // 8. Check team size limit
    if (event.teamMaxSize && team.memberCount >= event.teamMaxSize) {
      throw new DomainError(
        "TEAM_FULL",
        `Team has reached maximum size of ${event.teamMaxSize}`
      );
    }

    // 9. Add member to team
    await input.db.$transaction(async (tx) => {
      // Re-check team status (in case it changed)
      const freshTeam = await tx.team.findUnique({
        where: { id: team.id },
        select: { status: true, memberCount: true },
      });

      if (freshTeam?.status !== TeamStatus.OPEN) {
        throw new DomainError("TEAM_CHANGED", "Team status changed, please try again");
      }

      if (event.teamMaxSize && freshTeam.memberCount >= event.teamMaxSize) {
        throw new DomainError("TEAM_FULL", "Team is now full");
      }

      // Create registration
      await tx.eventRegistration.create({
        data: {
          userId: input.userId,
          eventId: event.id,
          teamId: team.id,
          memberRole: TeamMemberRole.MEMBER,
          teamName: team.name,
          teamSize: 1, // Will be updated when team is locked
          source: RegistrationSource.ONLINE,
          syncStatus: RegistrationSyncStatus.APPLIED,
          year: activeYear,
        },
      });

      // Increment team member count
      await tx.team.update({
        where: { id: team.id },
        data: {
          memberCount: {
            increment: 1,
          },
        },
      });
    });

    return {
      success: true,
      teamId: team.id,
      eventId: event.id,
      message: `Successfully joined team ${team.name}`,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: err.message,
        details: err.details,
      };
    }

    console.error("Error joining team:", err);
    return {
      success: false,
      error: "Failed to join team",
      details: { cause: String(err) },
    };
  }
}

export interface LockTeamInput {
  teamId: string;
  lockedBy: string; // Admin or team leader user ID
  db: DbClient;
}

export interface LockTeamResult {
  success: boolean;
  teamId?: string;
  memberCount?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Lock a team (prevent new members from joining, finalize member count)
 */
export async function lockTeam(input: LockTeamInput): Promise<LockTeamResult> {
  const activeYear = getActiveYear();

  try {
    // 1. Fetch team and related data
    const team = await input.db.team.findUnique({
      where: { id: input.teamId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            year: true,
            teamMinSize: true,
            teamMaxSize: true,
            date: true,
            endDate: true,
            submissionUrl: true,
            submissionDeadline: true,
          },
        },
        members: {
          select: {
            userId: true,
            memberRole: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new DomainError("TEAM_NOT_FOUND", "Team not found");
    }

    if (team.status !== TeamStatus.OPEN) {
      throw new DomainError(
        "TEAM_NOT_OPEN",
        `Team cannot be locked (current status: ${team.status})`
      );
    }

    // 2. Validate team size constraints
    const { valid, error } = validateTeamSize(
      team.memberCount,
      team.event.teamMinSize,
      team.event.teamMaxSize
    );

    if (!valid) {
      throw new DomainError("INVALID_TEAM_SIZE", error || "Invalid team size");
    }

    // 3. Lock the team (use conditional update to prevent race conditions)
    const updated = await input.db.team.updateMany({
      where: {
        id: input.teamId,
        status: TeamStatus.OPEN, // Only update if still OPEN
      },
      data: {
        status: TeamStatus.LOCKED,
        lockedAt: new Date(),
        lockedBy: input.lockedBy,
        memberCount: team.memberCount, // Ensure it's set correctly
      },
    });

    if (updated.count === 0) {
      throw new DomainError(
        "TEAM_LOCKED_RACE",
        "Team status changed before lock could be applied"
      );
    }

    // 4. Update all member registrations with final team size
    await input.db.eventRegistration.updateMany({
      where: {
        teamId: input.teamId,
      },
      data: {
        teamSize: team.memberCount,
      },
    });

    // 5. Send confirmation emails to all members concurrently without failing the lock
    await Promise.allSettled(
      team.members.map((member) =>
        sendTeamLockedEmail({
          memberEmail: member.user.email,
          memberName: member.user.firstName,
          teamName: team.name,
          eventName: team.event.name,
          teamCode: team.teamCode,
          submissionUrl: team.event.submissionUrl,
          submissionDeadline: team.event.submissionDeadline,
        })
      )
    );

    return {
      success: true,
      teamId: team.id,
      memberCount: team.memberCount,
    };
  } catch (err) {
    if (err instanceof DomainError) {
      return {
        success: false,
        error: err.message,
        details: err.details,
      };
    }

    console.error("Error locking team:", err);
    return {
      success: false,
      error: "Failed to lock team",
      details: { cause: String(err) },
    };
  }
}
