'use server'

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function normalizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

async function generateUniqueTeamCode(
  tx: {
    team: {
      findUnique: typeof prisma.team.findUnique;
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
    // 1. Find Event ID
    const event = await prisma.event.findUnique({
      where: { name: eventName }
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
        isActive: true,
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
    return await prisma.event.findMany({
      where: { isActive: true },
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

export async function scannerRegisterTeamMember(userId: string, eventName: string, teamName: string) {
  try {
    const normalizedTeam = normalizeTeamName(teamName);
    if (!normalizedTeam) {
      return { success: false, error: "Team name is required." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { payment: true },
      });

      if (!user) return { success: false as const, error: "User not found." };
      if (user.payment?.status !== "VERIFIED") {
        return { success: false as const, error: "Only verified users can be added to team events." };
      }

      const event = await tx.event.findFirst({
        where: {
          name: { equals: eventName, mode: "insensitive" },
          isActive: true,
        },
      });
      if (!event) return { success: false as const, error: "Event not found." };
      if (event.participationMode !== "TEAM") {
        return { success: false as const, error: "This event is not a team event." };
      }

      const existing = await tx.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId,
            eventId: event.id,
          },
        },
      });
      if (existing) return { success: true as const, message: "Participant already in this event." };

      const eventRegistrations = await tx.eventRegistration.findMany({
        where: { eventId: event.id },
        select: { teamId: true, teamSize: true },
      });
      const participantCount = eventRegistrations.reduce(
        (sum, registration) => sum + (registration.teamId ? 1 : registration.teamSize || 1),
        0
      );
      if (event.maxParticipants != null && participantCount + 1 > event.maxParticipants) {
        return { success: false as const, error: "Event is full." };
      }

      let team = await tx.team.findUnique({
        where: {
          eventId_nameNormalized: {
            eventId: event.id,
            nameNormalized: normalizedTeam,
          },
        },
      });

      if (!team) {
        const currentTeams = await tx.team.count({ where: { eventId: event.id } });
        if (event.maxTeams != null && currentTeams >= event.maxTeams) {
          return { success: false as const, error: "Team slots are full." };
        }

        team = await tx.team.create({
          data: {
            eventId: event.id,
            name: teamName.trim(),
            nameNormalized: normalizedTeam,
            teamCode: await generateUniqueTeamCode(tx, event.id),
            memberCount: 0,
            status: "DRAFT",
            leaderUserId: user.id,
            leaderContactPhoneSnapshot: user.phone,
            leaderContactEmailSnapshot: user.email,
          },
        });
      }

      if (team.status !== "DRAFT") {
        return { success: false as const, error: "Team is already locked." };
      }

      const maxTeamSize = event.teamMaxSize ?? 4;
      if (team.memberCount + 1 > maxTeamSize) {
        return { success: false as const, error: `Team can have at most ${maxTeamSize} members.` };
      }

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          teamId: team.id,
          teamName: team.name,
          teamSize: 1,
          memberRole: team.leaderUserId === user.id ? "LEADER" : "MEMBER",
          attended: true,
          attendedAt: new Date(),
        },
      });

      await tx.team.update({
        where: { id: team.id },
        data: {
          memberCount: {
            increment: 1,
          },
        },
      });

      return { success: true as const, message: `Added to team ${team.name} and marked present.` };
    });

    if (!result.success) return result;

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
    const normalizedTeam = normalizeTeamName(teamName);
    if (!normalizedTeam) {
      return { success: false, error: "Team name is required." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: {
          name: { equals: eventName, mode: "insensitive" },
          isActive: true,
        },
      });

      if (!event) return { success: false as const, error: "Event not found." };
      if (event.participationMode !== "TEAM") {
        return { success: false as const, error: "This event is not a team event." };
      }

      const team = await tx.team.findUnique({
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

      if (!team) return { success: false as const, error: "Team not found." };
      if (team.status !== "DRAFT") {
        return { success: false as const, error: "Team is already completed and locked." };
      }

      if (leaderUserId) {
        const proposedLeader = team.members.find((member) => member.userId === leaderUserId);
        if (!proposedLeader) {
          return { success: false as const, error: "Leader must be a member of this team." };
        }

        const leaderUser = await tx.user.findUnique({ where: { id: leaderUserId } });
        if (!leaderUser) {
          return { success: false as const, error: "Leader user not found." };
        }

        await tx.team.update({
          where: { id: team.id },
          data: {
            leaderUserId,
            leaderContactPhoneSnapshot: leaderUser.phone,
            leaderContactEmailSnapshot: leaderUser.email,
          },
        });

        await tx.eventRegistration.updateMany({
          where: { teamId: team.id },
          data: { memberRole: "MEMBER" },
        });

        await tx.eventRegistration.update({
          where: { id: proposedLeader.id },
          data: { memberRole: "LEADER" },
        });
      }

      const refreshedTeam = await tx.team.findUnique({
        where: { id: team.id },
        include: { members: { select: { userId: true } } },
      });

      if (!refreshedTeam || !refreshedTeam.leaderUserId) {
        return { success: false as const, error: "Team leader is required." };
      }

      if (!refreshedTeam.members.some((member) => member.userId === refreshedTeam.leaderUserId)) {
        return { success: false as const, error: "Team leader must be part of this team." };
      }

      const memberCount = refreshedTeam.members.length;
      const teamMinSize = event.teamMinSize ?? 2;
      const teamMaxSize = event.teamMaxSize ?? 4;
      if (memberCount < teamMinSize) {
        return {
          success: false as const,
          error: `At least ${teamMinSize} members are required to complete team registration.`,
        };
      }
      if (memberCount > teamMaxSize) {
        return {
          success: false as const,
          error: `Team can have at most ${teamMaxSize} members.`,
        };
      }

      await tx.team.update({
        where: { id: refreshedTeam.id },
        data: {
          status: "LOCKED",
          memberCount,
          lockedAt: new Date(),
        },
      });

      return { success: true as const, message: `Team ${refreshedTeam.name} registration completed.` };
    });

    if (!result.success) return result;

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

export async function registerCurrentUserForEvent(eventName: string) {
  try {
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
        isActive: true,
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

