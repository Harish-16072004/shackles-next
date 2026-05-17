import { Prisma, PrismaClient, RegistrationSource, RegistrationSyncStatus } from "@prisma/client";
import { getEventParticipantCount, isMaxParticipantsExceeded, isMaxTeamsExceeded } from "@/server/services/capacity.service";
import { normalizeName } from "@/server/services/team-registration.service";
import {
  getVerifiedPackage,
  canAccessEventCategory,
  ensureNoTimeClash,
  DomainError,
} from "@/server/services/registration-helpers.service";
import { sendEventRegistrationEmail } from "@/server/services/email.service";
import { getActiveYear } from "@/lib/edition";
import { safeLogError } from "@/lib/safe-log";

type DbClient = Prisma.TransactionClient | PrismaClient;

export type EventRegistrationServiceResult =
  | { success: true; message: string; reason?: string }
  | { success: false; reason: string; error: string; details?: Record<string, unknown> };

/**
 * Register a user for an individual (non-team) event
 * Includes package eligibility and time clash checks
 */
export async function registerForIndividualEvent(input: {
  db: DbClient;
  userId: string;
  eventId: string;
  sendEmail?: boolean;
}): Promise<EventRegistrationServiceResult> {
  const activeYear = getActiveYear();

  try {
    // 1. Verify user and payment
    const user = await input.db.user.findUnique({
      where: { id: input.userId },
      include: { payment: true },
    });

    if (!user) {
      return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
    }

    if (!user.payment || user.payment.status !== "VERIFIED" || user.payment.year !== activeYear) {
      return {
        success: false,
        reason: "PAYMENT_NOT_VERIFIED",
        error: "Payment must be verified for the active year.",
      };
    }

    // 2. Fetch and validate event
    const event = await input.db.event.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        name: true,
        year: true,
        category: true,
        participationMode: true,
        isActive: true,
        isArchived: true,
        isTemplate: true,
        date: true,
        endDate: true,
        maxParticipants: true,
        maxTeams: true,
      },
    });

    if (!event) {
      return { success: false, reason: "EVENT_NOT_FOUND", error: "Event not found." };
    }

    if (event.year !== activeYear) {
      return { success: false, reason: "EVENT_WRONG_YEAR", error: "Event is not in the active year." };
    }

    if (!event.isActive || event.isArchived || event.isTemplate) {
      return { success: false, reason: "EVENT_INACTIVE", error: "Event is not available for registration." };
    }

    if (event.participationMode !== "INDIVIDUAL") {
      return { success: false, reason: "NOT_INDIVIDUAL_EVENT", error: "This event requires team registration." };
    }

    // 3. Check package eligibility
    const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
    if (!pkg) {
      return { success: false, reason: "NO_PACKAGE", error: "No verified package found." };
    }

    if (!canAccessEventCategory(pkg.packageType, event.category)) {
      return {
        success: false,
        reason: "PACKAGE_NOT_ALLOWED",
        error: `Your package does not allow registration for ${event.category} events.`,
      };
    }

    // 4. Check for time clash
    try {
      await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);
    } catch (err) {
      if (err instanceof DomainError) {
        return { success: false, reason: err.code, error: err.message, details: err.details };
      }
      throw err;
    }

    // 5. Check if already registered
    const existing = await input.db.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: input.userId,
          eventId: event.id,
        },
      },
    });

    if (existing) {
      return { success: true, reason: "ALREADY_REGISTERED", message: "Already registered for this event." };
    }

    // Acquire lock to prevent race conditions on capacity check
    await input.db.event.update({
      where: { id: event.id },
      data: { isActive: event.isActive },
    });

    // 6. Check capacity
    const participantCount = await getEventParticipantCount({
      db: input.db,
      eventId: event.id,
    });

    if (isMaxParticipantsExceeded(event.maxParticipants, participantCount, 1)) {
      return { success: false, reason: "CAPACITY_FULL", error: "Event is at maximum capacity." };
    }

    // 7. Create registration
    await input.db.eventRegistration.create({
      data: {
        userId: input.userId,
        eventId: event.id,
        teamSize: 1,
        source: RegistrationSource.ONLINE,
        syncStatus: RegistrationSyncStatus.APPLIED,
        year: activeYear,
      },
    });

    // 8. Send confirmation email if requested (fire and forget)
    if (input.sendEmail) {
      sendEventRegistrationEmail({
        userEmail: user.email,
        userName: user.firstName,
        eventName: event.name,
      }).catch(err => safeLogError("Email failed in registration", err));
    }

    return {
      success: true,
      message: `Successfully registered for ${event.name}.`,
    };
  } catch (err) {
    safeLogError("Error registering for event", err);
    return {
      success: false,
      reason: "REGISTRATION_FAILED",
      error: "Failed to complete registration.",
      details: { cause: String(err) },
    };
  }
}

/**
 * Quick register and mark attendance for on-spot registration
 * Includes package and time clash checks
 */
export async function quickRegisterAndMarkAttendance(input: {
  db: DbClient;
  userId: string;
  eventId: string;
  stationId: string;
  clientOperationId?: string;
  syncedAt?: Date;
  teamEventMessage?: string;
  successMessage?: string;
}) {
  const activeYear = getActiveYear();

  const user = await input.db.user.findUnique({
    where: { id: input.userId },
    include: { payment: true },
  });

  if (!user) {
    return { success: false, reason: "USER_NOT_FOUND", error: "User not found." };
  }

  if (!user.payment || user.payment.status !== "VERIFIED" || user.payment.year !== activeYear) {
    return {
      success: false,
      reason: "PAYMENT_NOT_VERIFIED",
      error: "Only verified users can be registered.",
    };
  }

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
      maxTeams: true,
      maxParticipants: true,
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

  // Check package eligibility
  const pkg = await getVerifiedPackage(input.db, input.userId, activeYear);
  if (!pkg) {
    return { success: false, reason: "NO_PACKAGE", error: "No verified package found." };
  }

  if (!canAccessEventCategory(pkg.packageType, event.category)) {
    return {
      success: false,
      reason: "PACKAGE_NOT_ALLOWED",
      error: `Your package does not allow registration for this event type.`,
    };
  }

  // Check for time clash
  try {
    await ensureNoTimeClash(input.db, input.userId, event.id, activeYear);
  } catch (err) {
    if (err instanceof DomainError) {
      return { success: false, reason: err.code, error: err.message };
    }
    throw err;
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
    return { success: true, reason: "ALREADY_REGISTERED", message: "Already registered." };
  }

  // Acquire lock to prevent race conditions on capacity check
  await input.db.event.update({
    where: { id: event.id },
    data: { isActive: true },
  });

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
      year: activeYear,
      ...(input.clientOperationId ? { clientOperationId: input.clientOperationId } : {}),
      ...(input.syncedAt ? { syncedAt: input.syncedAt } : {}),
    },
  });

  return {
    success: true,
    message: input.successMessage || `Successfully registered & marked present for ${event.name}`,
  };
}
