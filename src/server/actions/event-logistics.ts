'use server'

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getActiveYear } from "@/lib/edition";
import { isScannerBulkTeamFlowEnabled } from "@/lib/env";
import { logAdminAudit } from "@/lib/admin-audit";
import { getSession, checkCanManageRegistrations, checkEventStaff } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";
import {
  addMemberToTeamEvent,
  bulkRegisterTeamByShacklesIds,
  completeExistingTeamRegistration,
  normalizeShacklesId,
  normalizeTeamName,
  generateUniqueTeamCode,
  parseUniqueShacklesIds,
} from "@/server/services/team-registration.service";
import { runSerializableTransaction } from "@/server/services/transaction.service";
import { decodeQrPayload } from "@/server/services/qr.service";
import { processQRScan } from "@/server/services/qr-management.service";
import { executeSafeAction } from "@/lib/safe-action";
import { Permission, Role, TeamMemberRole } from "@prisma/client";

// --- 1. SCAN LOGIC (For Volunteers) ---
// Input: Scanned QR Token string
// Output: Safe User Details + Event Status
export async function scanParticipantQR(token: string) {
  return executeSafeAction({ permission: Permission.SCAN_ATTENDANCE }, async (session) => {
    // 1. Decode the structured QR payload
    let userQrToken: string;
    try {
      const decoded = decodeQrPayload(token);
      if (decoded.type !== 'USER') {
        throw new Error("Invalid QR type. Must be a user QR.");
      }
      userQrToken = decoded.uid;
    } catch (e) {
      // Fallback for direct token lookup if payload is not structured
      userQrToken = token;
    }

    const user = await prisma.user.findUnique({
      where: { qrToken: userQrToken },
      include: {
        registrations: {
          include: { event: true }
        }
      }
    });

    if (!user) {
      throw new Error("Invalid QR Code");
    }

    // Return ONLY what's needed for the volunteer
    return {
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
    };
  })
}

export async function scanParticipantByShacklesId(shacklesId: string) {
  return executeSafeAction({ permission: Permission.SCAN_ATTENDANCE }, async (session) => {
    const normalized = shacklesId.trim();
    if (!normalized) {
      throw new Error("Shackles ID is required");
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
      throw new Error("Participant not found for Shackles ID");
    }

    return {
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
    };
  })
}

// --- 2. KIT DISTRIBUTION ---
export async function updateKitStatus(userId: string) {
  return executeSafeAction({ permission: Permission.SCAN_KIT }, async (session) => {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        kitStatus: 'ISSUED',
        kitIssuedAt: new Date()
      }
    });
    
    revalidatePath('/admin'); 
    return { message: "Kit Issued Successfully" };
  })
}

export async function getKitsIssuedCount() {
  try {
    const count = await prisma.user.count({
      where: {
        kitStatus: 'ISSUED'
      }
    });
    return { success: true, count };
  } catch (error) {
    console.error("Error fetching kit count:", error);
    return { success: false, count: 0 };
  }
}

// --- 3. EVENT ATTENDANCE ---
export async function markEventAttendance(userId: string, eventName: string) {
  return executeSafeAction({ permission: Permission.SCAN_ATTENDANCE }, async (session) => {
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

    if (!event) throw new Error("Event not found");

    // 2. Check Registration
    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: userId,
          eventId: event.id
        }
      }
    });

    // 3. Scenario: Not Registered
    if (!registration) {
      throw new Error(`User is not registered for ${eventName}. Please register first.`);
    }

    // 4. Scenario: Already Attended
    if (registration.attended) {
      return { message: "Already marked present." };
    }

    // 5. Scenario: Registered -> Mark Present
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        attended: true,
        attendedAt: new Date()
      }
    });

    return { message: `Marked present for ${eventName}` };
  })
}

// --- 4. QUICK REGISTRATION (On-Spot) ---
export async function quickRegisterForEvent(userId: string, eventName: string) {
  return executeSafeAction({ permission: Permission.ONSPOT_INDIVIDUAL_REG }, async (session) => {
    const activeYear = getActiveYear();

    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { payment: true },
      });
      if (!user) throw new Error("User not found");
      if (user.payment?.status !== "VERIFIED") {
        throw new Error("Only verified users can be registered.");
      }

      const event = await tx.event.findFirst({
        where: {
          name: { equals: eventName, mode: "insensitive" },
          year: activeYear,
          isActive: true,
          isArchived: false,
          isTemplate: false,
        },
      });
      if (!event) throw new Error("Event not found");

      if (event.participationMode === "TEAM") {
        throw new Error("Team events require full team registration flow with leader assignment.");
      }

      const participantCount = await tx.eventRegistration.count({ where: { eventId: event.id } });

      if (event.maxParticipants != null && participantCount + 1 > event.maxParticipants) {
        throw new Error("Event is full");
      }

      // Create Registration
      await tx.eventRegistration.create({
        data: {
          userId: userId,
          eventId: event.id,
          teamSize: 1,
          attended: true,
          attendedAt: new Date()
        }
      });

      return { message: `Successfully registered & marked present for ${eventName}` };
    });
  })
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
        status: 'OPEN',
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
  return executeSafeAction({ permission: Permission.ONSPOT_TEAM_REG }, async (session) => {
    const result = await runSerializableTransaction(prisma, async (tx) => addMemberToTeamEvent({
      db: tx,
      userId,
      eventName,
      teamName,
      stationId: selectedStationId(eventName),
    }));

    if (!result.success) throw new Error(result.error || "Team registration failed");

    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");

    return result;
  })
}

export async function scannerCompleteTeamRegistration(eventName: string, teamName: string, leaderUserId?: string) {
  return executeSafeAction({ permission: Permission.ONSPOT_TEAM_REG }, async (session) => {
    const result = await runSerializableTransaction(prisma, async (tx) => completeExistingTeamRegistration({
      db: tx,
      eventName,
      teamName,
      leaderUserId,
    }));

    if (!result.success) throw new Error(result.error || "Unable to complete team registration");

    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/events");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/workshops");

    return result;
  })
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
  if (!scanned.success) {
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
        error: "Validation failed. Please check your input and try again.",
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


// ---------------------------------------------------------------------------
// Admin: Change Team Leader (migrated from api/admin/event-registrations/change-leader)
// ---------------------------------------------------------------------------

const changeLeaderRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: "action:admin:change-leader",
});

export async function changeTeamLeader(input: {
  teamId: string;
  newLeaderUserId: string;
  eventId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { teamId, newLeaderUserId, eventId } = input;

  if (!teamId || !newLeaderUserId || !eventId) {
    return { success: false, error: "Missing required fields." };
  }

  const { allowed, session } = await checkCanManageRegistrations(eventId);
  if (!allowed || !session) {
    return { success: false, error: "Unauthorized." };
  }

  const rl = await changeLeaderRateLimiter.limit(`admin:change-leader:${session.userId}`);
  if (!rl.success) {
    return { success: false, error: "Too many attempts. Please try again later." };
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, leaderUserId: true, members: { select: { userId: true } } },
  });

  if (!team) return { success: false, error: "Team not found." };

  const isMember = team.members.some((m) => m.userId === newLeaderUserId);
  if (!isMember) return { success: false, error: "Selected user is not a member of this team." };

  if (team.leaderUserId === newLeaderUserId) {
    return { success: false, error: "This user is already the team leader." };
  }

  await prisma.$transaction([
    prisma.eventRegistration.updateMany({
      where: { teamId, userId: team.leaderUserId ?? "" },
      data: { memberRole: "MEMBER" },
    }),
    prisma.eventRegistration.updateMany({
      where: { teamId, userId: newLeaderUserId },
      data: { memberRole: "LEADER" },
    }),
    prisma.team.update({
      where: { id: teamId },
      data: { leaderUserId: newLeaderUserId },
    }),
  ]);

  revalidatePath("/admin/event-registrations");
  revalidatePath(`/admin/event-registrations/${eventId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin: Delete Team Member (migrated from api/admin/event-registrations/delete-member)
// ---------------------------------------------------------------------------

const deleteMemberRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "action:admin:delete-member",
});

export async function deleteTeamMember(input: {
  registrationId: string;
  eventId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { registrationId, eventId } = input;

  if (!eventId) return { success: false, error: "Event ID is required." };
  if (!registrationId) return { success: false, error: "Registration ID is required." };

  const { allowed, session } = await checkCanManageRegistrations(eventId);
  if (!allowed || !session) {
    return { success: false, error: "Unauthorized." };
  }

  const rl = await deleteMemberRateLimiter.limit(`admin:delete-member:${session.userId}`);
  if (!rl.success) {
    return { success: false, error: "Too many attempts. Please try again later." };
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, teamId: true, userId: true, memberRole: true },
  });

  if (!registration) return { success: false, error: "Registration not found." };

  await prisma.$transaction(async (tx) => {
    await tx.eventRegistration.delete({ where: { id: registration.id } });

    if (!registration.teamId) return;

    const remaining = await tx.eventRegistration.findMany({
      where: { teamId: registration.teamId },
      orderBy: { userId: "asc" },
      select: { userId: true, memberRole: true },
    });

    if (remaining.length === 0) {
      await tx.team.delete({ where: { id: registration.teamId } });
      return;
    }

    const nextLeader =
      remaining.find((item) => item.memberRole === TeamMemberRole.LEADER)?.userId || remaining[0].userId;

    await tx.eventRegistration.updateMany({
      where: { teamId: registration.teamId },
      data: { memberRole: TeamMemberRole.MEMBER },
    });

    await tx.eventRegistration.updateMany({
      where: { teamId: registration.teamId, userId: nextLeader },
      data: { memberRole: TeamMemberRole.LEADER },
    });

    const leaderUser = await tx.user.findUnique({
      where: { id: nextLeader },
      select: { id: true, phone: true, email: true },
    });

    await tx.team.update({
      where: { id: registration.teamId },
      data: {
        memberCount: remaining.length,
        leaderUserId: leaderUser?.id || null,
        leaderContactPhoneSnapshot: leaderUser?.phone || null,
        leaderContactEmailSnapshot: leaderUser?.email || null,
      },
    });
  });

  revalidatePath("/admin/event-registrations", "layout");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Admin: Delete Entire Team (migrated from api/admin/event-registrations/delete-team)
// ---------------------------------------------------------------------------

const deleteTeamRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "action:admin:delete-team",
});

export async function deleteTeam(input: {
  teamId: string;
  eventId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { teamId, eventId } = input;

  if (!eventId) return { success: false, error: "Event ID is required." };
  if (!teamId) return { success: false, error: "Team ID is required." };

  const { allowed, session } = await checkCanManageRegistrations(eventId);
  if (!allowed || !session) {
    return { success: false, error: "Unauthorized." };
  }

  const rl = await deleteTeamRateLimiter.limit(`admin:delete-team:${session.userId}`);
  if (!rl.success) {
    return { success: false, error: "Too many attempts. Please try again later." };
  }

  const existingTeam = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!existingTeam) return { success: false, error: "Team not found." };

  await prisma.$transaction(async (tx) => {
    await tx.eventRegistration.deleteMany({ where: { teamId } });
    await tx.team.delete({ where: { id: teamId } });
  });

  revalidatePath("/admin/event-registrations", "layout");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  return { success: true };
}

// ---------------------------------------------------------------------------
// Scanner: Process QR Scan (migrated from api/scanner/qr-scan)
// ---------------------------------------------------------------------------

export async function processQRScanAction(input: {
  qrData: string;
  stationId: string;
  eventId?: string;
  operationType: string;
}): Promise<{ success: boolean; error?: string; [key: string]: any }> {
  const { qrData, stationId, eventId, operationType } = input;

  if (!qrData || !stationId || !operationType) {
    return { success: false, error: "Missing required fields" };
  }

  const requiredPermission: Permission = operationType === 'KIT' ? Permission.KIT_ISSUANCE : Permission.SCAN_ATTENDANCE;

  if (eventId) {
    const { allowed, error } = await checkEventStaff(eventId, requiredPermission);
    if (!allowed) {
      return { success: false, error: error || "Forbidden" };
    }
  }

  try {
    const result = await processQRScan(prisma, {
      qrData,
      stationId,
      eventId,
      operationType,
      timestamp: new Date(),
    });
    return result;
  } catch (error) {
    console.error("QR Scan Error:", error);
    return { success: false, error: "Internal Server Error" };
  }
}

// ---------------------------------------------------------------------------
// Scanner: Check Registration Status (migrated from api/scanner/check-registration)
// ---------------------------------------------------------------------------

export async function checkRegistrationStatus(input: {
  shacklesId: string;
  eventId: string;
}): Promise<{
  success: boolean;
  error?: string;
  registered?: boolean;
  participant?: { name: string; shacklesId: string | null };
  event?: { id: string; name: string; type: string; participationMode: string; minTeamSize: number | null; maxTeamSize: number | null };
}> {
  const { shacklesId, eventId } = input;

  if (!shacklesId || !eventId) {
    return { success: false, error: "Missing shacklesId or eventId" };
  }

  const { allowed, error } = await checkEventStaff(eventId, Permission.SCAN_ATTENDANCE);
  if (!allowed) {
    return { success: false, error: error || "Forbidden" };
  }

  try {
    const normalizedId = normalizeShacklesId(shacklesId);
    const user = await prisma.user.findUnique({
      where: { shacklesId: normalizedId },
      select: { id: true, firstName: true, lastName: true, shacklesId: true },
    });

    if (!user) return { success: false, error: "Participant not found" };

    const registration = await prisma.eventRegistration.findFirst({
      where: { userId: user.id, eventId },
      select: { id: true },
    });

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, type: true, participationMode: true, teamMinSize: true, teamMaxSize: true },
    });

    if (!event) return { success: false, error: "Event not found" };

    return {
      success: true,
      registered: !!registration,
      participant: { name: `${user.firstName} ${user.lastName}`.trim(), shacklesId: user.shacklesId },
      event: {
        id: event.id,
        name: event.name,
        type: event.type,
        participationMode: event.participationMode,
        minTeamSize: event.teamMinSize,
        maxTeamSize: event.teamMaxSize,
      },
    };
  } catch (error) {
    console.error("Check Registration Error:", error);
    return { success: false, error: "Internal Server Error" };
  }
}

// ---------------------------------------------------------------------------
// Scanner: Register for Event (migrated from api/scanner/register-for-event)
// ---------------------------------------------------------------------------

export async function scannerRegisterForEvent(input: {
  shacklesId: string;
  eventId: string;
}): Promise<{ success: boolean; error?: string; registrationId?: string; message?: string }> {
  const { shacklesId, eventId } = input;

  if (!shacklesId || !eventId) {
    return { success: false, error: "Missing shacklesId or eventId" };
  }

  const { allowed, error } = await checkEventStaff(eventId, Permission.SCAN_ATTENDANCE);
  if (!allowed) {
    return { success: false, error: error || "Forbidden" };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { shacklesId },
      select: { id: true },
    });

    if (!user) return { success: false, error: "Participant not found" };

    const existingRegistration = await prisma.eventRegistration.findFirst({
      where: { userId: user.id, eventId },
      select: { id: true },
    });

    if (existingRegistration) {
      return { success: false, error: "Participant already registered for this event" };
    }

    const activeYear = getActiveYear();
    const registration = await prisma.eventRegistration.create({
      data: { userId: user.id, eventId, year: activeYear, attended: false },
      select: { id: true },
    });

    return { success: true, registrationId: registration.id, message: "Participant registered for event. Scan again to mark attendance." };
  } catch (error) {
    console.error("Register for Event Error:", error);
    return { success: false, error: "Internal Server Error" };
  }
}

// ---------------------------------------------------------------------------
// Scanner: Create Team (migrated from api/scanner/create-team)
// ---------------------------------------------------------------------------

export async function scannerCreateTeam(input: {
  scannedShacklesId: string;
  memberShacklesIds: string[];
  eventId: string;
  teamName: string;
  lockStatus?: string;
}): Promise<{ success: boolean; error?: string; teamId?: string; totalMembers?: number; message?: string }> {
  const { scannedShacklesId, memberShacklesIds, eventId, teamName, lockStatus } = input;

  if (!scannedShacklesId || !memberShacklesIds || !eventId || !teamName) {
    return { success: false, error: "Missing required fields" };
  }

  if (!Array.isArray(memberShacklesIds)) {
    return { success: false, error: "memberShacklesIds must be an array" };
  }

  const { allowed, error } = await checkEventStaff(eventId, Permission.SCAN_ATTENDANCE);
  if (!allowed) {
    return { success: false, error: error || "Forbidden" };
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { type: true, teamMinSize: true, teamMaxSize: true },
    });

    if (!event) return { success: false, error: "Event not found" };

    const normalizedCaptainId = normalizeShacklesId(scannedShacklesId);
    const captain = await prisma.user.findUnique({
      where: { shacklesId: normalizedCaptainId },
      select: { id: true, email: true, phone: true },
    });

    if (!captain) return { success: false, error: "Captain (scanned user) not found" };

    const normalizedMemberIds = memberShacklesIds.map(id => normalizeShacklesId(id));
    const members = await prisma.user.findMany({
      where: { shacklesId: { in: normalizedMemberIds } },
      select: { id: true, shacklesId: true },
    });

    if (members.length !== normalizedMemberIds.length) {
      const foundIds = new Set(members.map((m) => m.shacklesId));
      const missingIds = normalizedMemberIds.filter((id) => !foundIds.has(id));
      return { success: false, error: `Members not found: ${missingIds.join(", ")}` };
    }

    const totalSize = 1 + normalizedMemberIds.length;
    if (event.teamMinSize && totalSize < event.teamMinSize) {
      return { success: false, error: `Team size ${totalSize} is below minimum ${event.teamMinSize}` };
    }
    if (event.teamMaxSize && totalSize > event.teamMaxSize) {
      return { success: false, error: `Team size ${totalSize} exceeds maximum ${event.teamMaxSize}` };
    }

    const memberIds = members.map((m) => m.id);
    if (memberIds.includes(captain.id)) {
      return { success: false, error: "Captain cannot be in team members list" };
    }
    if (new Set(memberIds).size !== memberIds.length) {
      return { success: false, error: "Duplicate members in team" };
    }

    const activeYear = getActiveYear();

    const existingRegs = await prisma.eventRegistration.findMany({
      where: { eventId, userId: { in: [captain.id, ...memberIds] } },
      select: { userId: true, teamId: true },
    });

    for (const reg of existingRegs) {
      if (reg.teamId) {
        return { success: false, error: "One or more team members already in a team for this event" };
      }
    }

    const normalizedName = normalizeTeamName(teamName);
    const teamCode = await generateUniqueTeamCode(prisma, eventId);

    const existingTeamName = await prisma.team.findUnique({
      where: { eventId_nameNormalized: { eventId, nameNormalized: normalizedName } },
    });

    if (existingTeamName) {
      return { success: false, error: "A team with this name already exists" };
    }

    const session = await getSession();
    const isLocked = lockStatus === "LOCKED";
    const isFull = totalSize === event.teamMaxSize;
    const finalStatus = (isLocked || isFull) ? "LOCKED" : "OPEN";

    const team = await prisma.team.create({
      data: {
        eventId,
        name: teamName,
        nameNormalized: normalizedName,
        teamCode,
        status: finalStatus,
        leaderUserId: captain.id,
        leaderContactEmailSnapshot: captain.email,
        leaderContactPhoneSnapshot: captain.phone,
        memberCount: totalSize,
        lockedAt: (isLocked || isFull) ? new Date() : null,
        lockedBy: (isLocked || isFull) ? String(session?.userId || "") : null,
      },
    });

    const allTeamUserIds = [captain.id, ...memberIds];
    await prisma.eventRegistration.createMany({
      data: allTeamUserIds.map((userId) => ({
        userId,
        eventId,
        teamId: team.id,
        year: activeYear,
        attended: false,
        memberRole: userId === captain.id ? "LEADER" : "MEMBER",
        teamName: teamName,
        teamSize: totalSize,
        source: "ONLINE" as const,
        syncStatus: "APPLIED" as const,
      })),
    });

    return {
      success: true,
      teamId: team.id,
      totalMembers: totalSize,
      message: isLocked ? "Team created and locked successfully." : `Draft team "${teamName}" saved successfully.`,
    };
  } catch (error) {
    console.error("Create Team Error:", error);
    return { success: false, error: "Internal Server Error" };
  }
}
