'use server'

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getActiveYear } from "@/lib/edition";
import { isScannerBulkTeamFlowEnabled } from "@/lib/env";
import { logAdminAudit } from "@/lib/admin-audit";
import {
  addMemberToTeamEvent,
  bulkRegisterTeamByShacklesIds,
  completeExistingTeamRegistration,
  normalizeShacklesId,
  parseUniqueShacklesIds,
} from "@/server/services/team-registration.service";
import { runSerializableTransaction } from "@/server/services/transaction.service";

// --- 1. SCAN LOGIC (For Volunteers) ---
// Input: Scanned QR Token string
// Output: Safe User Details + Event Status
export async function scanParticipantQR(token: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { qrToken: token },
      include: {
        registrations: {
          include: { event: true }
        }
      }
    });

    if (!user) {
      return { success: false, error: "Invalid QR Code" };
    }

    // Return ONLY what's needed for the volunteer
    return {
      success: true,
      data: {
        id: user.id,
        shacklesId: user.shacklesId,
        firstName: user.firstName, // Just first name to confirm identity
        role: user.role,
        kitStatus: user.kitStatus,
        registrationType: user.registrationType,
        events: user.registrations.map(r => ({
          eventName: r.event.name,
          attended: r.attended,
          teamName: r.teamName,
          memberRole: r.memberRole
        }))
      }
    };
  } catch (error) {
    console.error("Scan Error:", error);
    return { success: false, error: "System Error during Scan" };
  }
}

export async function scanParticipantByShacklesId(shacklesId: string) {
  try {
    const normalized = shacklesId.trim();
    if (!normalized) {
      return { success: false, error: "Shackles ID is required" };
    }

    const user = await prisma.user.findUnique({
      where: { shacklesId: normalized },
      include: {
        registrations: {
          include: { event: true }
        }
      }
    });

    if (!user) {
      return { success: false, error: "Participant not found for Shackles ID" };
    }

    return {
      success: true,
      data: {
        id: user.id,
        shacklesId: user.shacklesId,
        firstName: user.firstName,
        role: user.role,
        kitStatus: user.kitStatus,
        registrationType: user.registrationType,
        events: user.registrations.map(r => ({
          eventName: r.event.name,
          attended: r.attended,
          teamName: r.teamName,
          memberRole: r.memberRole
        }))
      }
    };
  } catch (error) {
    console.error("Scan by Shackles ID Error:", error);
    return { success: false, error: "System Error during scan" };
  }
}

// --- 2. KIT DISTRIBUTION ---
export async function updateKitStatus(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        kitStatus: 'ISSUED',
        kitIssuedAt: new Date()
      }
    });
    
    // Revalidate dashboard logic if needed
    revalidatePath('/admin'); 
    return { success: true, message: "Kit Issued Successfully" };
  } catch {
    return { success: false, error: "Failed to update kit status" };
  }
}

// --- 3. EVENT ATTENDANCE ---
export async function markEventAttendance(userId: string, eventName: string) {
  try {
    const activeYear = getActiveYear();

    // 1. Find Event ID
    const event = await prisma.event.findFirst({
      where: {
        name: {
          equals: eventName,
          mode: "insensitive",
        },
        year: activeYear,
        isArchived: false,
        isTemplate: false,
      },
    });

    if (!event) return { success: false, error: "Event not found" };

    // 2. Check Registration
    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: userId,
          eventId: event.id
        }
      }
    });

    // 3. Scenario: Not Registered -> "Prompt to Register"
    if (!registration) {
      return { 
        success: false, 
        code: "NOT_REGISTERED",
        error: `User is not registered for ${eventName}. Please register first.` 
      };
    }

    // 4. Scenario: Already Attended
    if (registration.attended) {
      return { success: true, message: "Already marked present." };
    }

    // 5. Scenario: Registered -> Mark Present
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        attended: true,
        attendedAt: new Date()
      }
    });

    return { success: true, message: `Marked present for ${eventName}` };

  } catch {
    return { success: false, error: "Attendance failed" };
  }
}

// --- 4. QUICK REGISTRATION (On-Spot) ---
export async function quickRegisterForEvent(userId: string, eventName: string) {
  try {
    const activeYear = getActiveYear();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { payment: true },
    });
    if (!user) return { success: false, error: "User not found" };
    if (user.payment?.status !== "VERIFIED") {
      return { success: false, error: "Only verified users can be registered." };
    }

    const event = await prisma.event.findFirst({
      where: {
        name: { equals: eventName, mode: "insensitive" },
        year: activeYear,
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
    });
    if (!event) return { success: false, error: "Event not found" };

    if (event.participationMode === "TEAM") {
      return {
        success: false,
        error: "Team events require full team registration flow with leader assignment.",
      };
    }

    const registeredTeams = await prisma.eventRegistration.count({ where: { eventId: event.id } });
    if (event.maxTeams != null && registeredTeams >= event.maxTeams) {
      return { success: false, error: "Team slots are full" };
    }

    const participants = await prisma.eventRegistration.findMany({
      where: { eventId: event.id },
      select: { teamId: true, teamSize: true },
    });
    const participantCount = participants.reduce((sum, registration) => {
      return sum + (registration.teamId ? 1 : registration.teamSize || 1);
    }, 0);

    if (event.maxParticipants != null && participantCount + 1 > event.maxParticipants) {
      return { success: false, error: "Event is full" };
    }

    // Create Registration
    await prisma.eventRegistration.create({
      data: {
        userId: userId,
        eventId: event.id,
        teamSize: 1,
        attended: true, // Auto-mark present since they are standing right there
        attendedAt: new Date()
      }
    });

    return { success: true, message: `Successfully registered & marked present for ${eventName}` };

  } catch {
    return { success: false, error: "Registration failed" };
  }
}

// --- 5. GET ALL EVENTS ---
export async function getAvailableEvents() {
  try {
    const activeYear = getActiveYear();

    return await prisma.event.findMany({
      where: {
        year: activeYear,
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
      select: {
        name: true,
        type: true,
        dayLabel: true,
        maxParticipants: true,
        participationMode: true,
        teamMinSize: true,
        teamMaxSize: true,
      }
    });
  } catch {
    return [];
  }
}

export async function getScannerJoinableTeams(input: {
  eventName: string;
  query?: string;
}) {
  try {
    const activeYear = getActiveYear();
    const normalizedEventName = input.eventName.trim();
    const normalizedQuery = (input.query || '').trim().toUpperCase();

    if (!normalizedEventName) {
      return [] as Array<{
        id: string;
        name: string;
        teamCode: string;
        memberCount: number;
        maxTeamSize: number;
        hasCapacity: boolean;
      }>;
    }

    const event = await prisma.event.findFirst({
      where: {
        name: { equals: normalizedEventName, mode: 'insensitive' },
        year: activeYear,
        isActive: true,
        isArchived: false,
        isTemplate: false,
        participationMode: 'TEAM',
      },
      select: {
        id: true,
        teamMaxSize: true,
      },
    });

    if (!event) return [];

    const teams = await prisma.team.findMany({
      where: {
        eventId: event.id,
        status: 'DRAFT',
        ...(normalizedQuery
          ? {
              OR: [
                { nameNormalized: { contains: normalizedQuery } },
                { teamCode: { contains: normalizedQuery } },
              ],
            }
          : {}),
      },
      orderBy: [{ memberCount: 'desc' }, { createdAt: 'asc' }],
      take: 10,
      select: {
        id: true,
        name: true,
        teamCode: true,
        memberCount: true,
      },
    });

    const maxTeamSize = event.teamMaxSize ?? 4;

    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      teamCode: team.teamCode,
      memberCount: team.memberCount,
      maxTeamSize,
      hasCapacity: team.memberCount < maxTeamSize,
    }));
  } catch (error) {
    console.error('[getScannerJoinableTeams] failed:', error);
    return [];
  }
}

export async function scannerRegisterTeamMember(userId: string, eventName: string, teamName: string) {
  try {
    const result = await runSerializableTransaction(prisma, async (tx) => addMemberToTeamEvent({
      db: tx,
      userId,
      eventName,
      teamName,
      stationId: selectedStationId(eventName),
    }));

    if (!result.success) return { success: false, error: result.error, reason: result.reason, details: result.details };

    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scannerRegisterTeamMember]", msg);
    return { success: false, error: `Team registration failed: ${msg}` };
  }
}

export async function scannerCompleteTeamRegistration(eventName: string, teamName: string, leaderUserId?: string) {
  try {
    const result = await runSerializableTransaction(prisma, async (tx) => completeExistingTeamRegistration({
      db: tx,
      eventName,
      teamName,
      leaderUserId,
    }));

    if (!result.success) return { success: false, error: result.error, reason: result.reason, details: result.details };

    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scannerCompleteTeamRegistration]", msg);
    return { success: false, error: `Unable to complete team registration: ${msg}` };
  }
}

function selectedStationId(eventName: string) {
  return `SCANNER:${eventName.trim().toUpperCase().replace(/\s+/g, "_")}`;
}

async function logScannerBulkAudit(input: {
  status: "SUCCESS" | "FAILED";
  target: string;
  details: Record<string, unknown>;
}) {
  const session = await getSession();
  const actorId = typeof session?.userId === "string" ? session.userId : "unknown";

  let actorEmail: string | null = null;
  if (actorId !== "unknown") {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true },
    });
    actorEmail = actor?.email ?? null;
  }

  await logAdminAudit({
    action: "SCANNER_TEAM_BULK_REGISTER",
    actorId,
    actorEmail,
    target: input.target,
    status: input.status,
    details: input.details,
  });
}

export async function getScannerBulkTeamFlowStatus() {
  return {
    enabled: isScannerBulkTeamFlowEnabled(),
  };
}

export async function getScannerStepStatus(token: string) {
  const scanned = await scanParticipantQR(token);
  if (!scanned.success || !scanned.data) {
    return {
      success: false,
      error: scanned.error || "Unable to resolve participant.",
    };
  }

  const participant = scanned.data;
  return {
    success: true,
    data: {
      participant,
      availableFunctions: ["MARK_ATTENDANCE", "ISSUE_KIT", "QUICK_REGISTER", "TEAM_REGISTRATION"],
      bulkFlowEnabled: isScannerBulkTeamFlowEnabled(),
    },
  };
}

export async function validateTeamRegistration(input: {
  eventName: string;
  teamName: string;
  memberShacklesIds: string[];
  leaderShacklesId?: string;
  operationId?: string;
}) {
  if (!isScannerBulkTeamFlowEnabled()) {
    return {
      success: false,
      reason: "FEATURE_DISABLED",
      error: "Bulk team registration is disabled.",
    };
  }

  let validationResult: Awaited<ReturnType<typeof bulkRegisterTeamByShacklesIds>> | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      validationResult = await bulkRegisterTeamByShacklesIds({
        db: tx,
        eventName: input.eventName,
        teamName: input.teamName,
        shacklesIds: Array.isArray(input.memberShacklesIds) ? input.memberShacklesIds : [],
        leaderShacklesId: input.leaderShacklesId || input.memberShacklesIds?.[0] || "",
        stationId: selectedStationId(input.eventName),
        operationId: input.operationId,
        lockTeam: false,
        markAttended: false,
      });

      // Force rollback for dry-run validation.
      throw new Error("SCANNER_DRY_RUN_ROLLBACK");
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== "SCANNER_DRY_RUN_ROLLBACK") {
      console.error("[validateTeamRegistration]", message);
      return {
        success: false,
        reason: "SYSTEM_ERROR",
        error: `Validation failed: ${message}`,
      };
    }
  }

  if (!validationResult) {
    return {
      success: false,
      reason: "SYSTEM_ERROR",
      error: "Validation did not return a result.",
    };
  }

  return validationResult;
}

export async function lockTeamAfterRegistration(input: {
  eventName: string;
  teamName: string;
  leaderUserId?: string;
}) {
  return scannerCompleteTeamRegistration(input.eventName, input.teamName, input.leaderUserId);
}

export async function scannerBulkRegisterTeam(input: {
  eventName: string;
  teamName: string;
  memberShacklesIds: string[];
  leaderShacklesId?: string;
  lockTeam?: boolean;
  operationId?: string;
}) {
  try {
    if (!isScannerBulkTeamFlowEnabled()) {
      await logScannerBulkAudit({
        status: "FAILED",
        target: input.eventName,
        details: {
          reason: "FEATURE_DISABLED",
          teamName: input.teamName,
          lockTeam: Boolean(input.lockTeam),
          submittedMemberCount: Array.isArray(input.memberShacklesIds) ? input.memberShacklesIds.length : 0,
        },
      });

      return {
        success: false,
        reason: "FEATURE_DISABLED",
        error: "Bulk team registration is disabled. Use legacy team actions.",
      };
    }

    const normalizedIds = parseUniqueShacklesIds(Array.isArray(input.memberShacklesIds) ? input.memberShacklesIds : []);
    if (normalizedIds.length === 0) {
      return { success: false, reason: "INVALID_INPUT", error: "Enter at least one Shackles ID." };
    }

    const leaderShacklesId = normalizeShacklesId(input.leaderShacklesId || normalizedIds[0] || "");
    const result = await runSerializableTransaction(prisma, async (tx) => bulkRegisterTeamByShacklesIds({
      db: tx,
      eventName: input.eventName,
      teamName: input.teamName,
      shacklesIds: normalizedIds,
      leaderShacklesId,
      stationId: selectedStationId(input.eventName),
      operationId: input.operationId,
      lockTeam: Boolean(input.lockTeam),
      markAttended: false,
    }), {
      maxRetries: 5,
    });

    if (!result.success) {
      await logScannerBulkAudit({
        status: "FAILED",
        target: input.eventName,
        details: {
          reason: result.reason,
          error: result.error,
          teamName: input.teamName,
          lockTeam: Boolean(input.lockTeam),
          memberCount: normalizedIds.length,
          ...(result.details ? { serviceDetails: result.details } : {}),
        },
      });

      return {
        success: false,
        reason: result.reason,
        error: result.error,
        details: result.details,
      };
    }

    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");

    await logScannerBulkAudit({
      status: "SUCCESS",
      target: input.eventName,
      details: {
        teamName: input.teamName,
        lockTeam: Boolean(input.lockTeam),
        memberCount: normalizedIds.length,
        leaderShacklesId,
      },
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[scannerBulkRegisterTeam]", msg);

    await logScannerBulkAudit({
      status: "FAILED",
      target: input.eventName,
      details: {
        reason: "SYSTEM_ERROR",
        error: msg,
        teamName: input.teamName,
        lockTeam: Boolean(input.lockTeam),
        submittedMemberCount: Array.isArray(input.memberShacklesIds) ? input.memberShacklesIds.length : 0,
      },
    });

    return { success: false, reason: "SYSTEM_ERROR", error: `Team registration failed: ${msg}` };
  }
}

export async function registerCurrentUserForEvent(eventName: string) {
  try {
    const activeYear = getActiveYear();

    const session = await getSession();
    if (!session?.userId) {
      return { success: false, error: "Please login to continue." };
    }

    const user = await prisma.user.findUnique({
      where: { id: String(session.userId) },
      include: { payment: true },
    });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    if (user.payment?.status !== "VERIFIED") {
      return { success: false, error: "Only verified users can register for events." };
    }

    const event = await prisma.event.findFirst({
      where: {
        name: { equals: eventName, mode: "insensitive" },
        year: activeYear,
        isActive: true,
        isArchived: false,
        isTemplate: false,
      },
    });

    if (!event) {
      return { success: false, error: "Event is not available." };
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId: event.id,
        },
      },
    });

    if (existing) {
      return { success: true, message: "Already registered for this event." };
    }

    const currentCount = await prisma.eventRegistration.count({ where: { eventId: event.id } });
    if (event.maxTeams != null && currentCount >= event.maxTeams) {
      return { success: false, error: "Team slots are full." };
    }

    if (event.participationMode === "TEAM") {
      return {
        success: false,
        error: "This is a team event. Please register with your team and leader.",
      };
    }

    const participants = await prisma.eventRegistration.findMany({
      where: { eventId: event.id },
      select: { teamId: true, teamSize: true },
    });
    const participantCount = participants.reduce((sum, registration) => {
      return sum + (registration.teamId ? 1 : registration.teamSize || 1);
    }, 0);

    if (event.maxParticipants != null && participantCount + 1 > event.maxParticipants) {
      return { success: false, error: "This event is full." };
    }

    await prisma.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
        teamSize: 1,
      },
    });

    revalidatePath("/userDashboard");
    revalidatePath("/admin/events");
    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/adminDashboard");

    return { success: true, message: "Registered successfully." };
  } catch {
    return { success: false, error: "Registration failed" };
  }
}

