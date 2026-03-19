import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { TeamMemberRole, TeamStatus } from "@prisma/client";
import { sendTeamInviteEmail } from "@/lib/email";

function normalizeName(name: string) {
  return name.trim().toUpperCase();
}

function normalizeTeamName(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeTeamCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
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

function deriveLeaderName(firstName: string, lastName: string, email: string) {
  const label = `${firstName} ${lastName}`.trim();
  return label || email;
}

function normalizeEventSlot(date: Date, endDate?: Date | null) {
  const start = date;
  let end = endDate ?? date;

  if (end < start) {
    end = start;
  }

  if (end.getTime() === start.getTime()) {
    end = new Date(end.getTime() + 1);
  }

  return { start, end };
}

function hasScheduleOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
) {
  return a.start < b.end && b.start < a.end;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Please login to register." }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const eventName = typeof body?.eventName === "string" ? body.eventName.trim() : "";
    const teamNameInput = typeof body?.teamName === "string" ? body.teamName.trim() : "";
    const teamCodeInput = typeof body?.teamCode === "string" ? body.teamCode.trim() : "";
    const inviteTokenInput = typeof body?.inviteToken === "string" ? body.inviteToken.trim() : "";
    const inviteEmailInput = typeof body?.inviteEmail === "string" ? body.inviteEmail.trim().toLowerCase() : "";
    const teamSizeInput = typeof body?.teamSize === "number" ? body.teamSize : Number(body?.teamSize);
    const rawAction = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "jointeam";
    const action = rawAction === "join" ? "jointeam" : rawAction;

    if (!eventName) {
      return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    }

    if (!["jointeam", "createteam", "sendinvite", "completeteam"].includes(action)) {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const normalizedEventName = normalizeName(eventName);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: String(session.userId) },
        include: { payment: true },
      });

      if (!user) {
        return { ok: false as const, code: 404, error: "User not found." };
      }

      if (user.payment?.status !== "VERIFIED") {
        return {
          ok: false as const,
          code: 403,
          error: "Only payment-verified users can register for events.",
        };
      }

      const event = await tx.event.findFirst({
        where: {
          name: {
            equals: normalizedEventName,
            mode: "insensitive",
          },
        },
      });

      if (!event || !event.isActive) {
        return { ok: false as const, code: 404, error: "Event is not available." };
      }

      const isTeamEvent = event.participationMode === "TEAM";

      if ((action === "jointeam" || action === "createteam") && event.date && !event.isAllDay) {
        const currentSlot = normalizeEventSlot(event.date, event.endDate);

        const sameUserRegistrations = await tx.eventRegistration.findMany({
          where: {
            userId: user.id,
            eventId: { not: event.id },
            event: {
              isAllDay: false,
              date: { not: null },
            },
          },
          select: {
            event: {
              select: {
                name: true,
                date: true,
                endDate: true,
              },
            },
          },
        });

        const conflictingRegistration = sameUserRegistrations.find((registration) => {
          if (!registration.event.date) return false;
          const otherSlot = normalizeEventSlot(registration.event.date, registration.event.endDate);
          return hasScheduleOverlap(currentSlot, otherSlot);
        });

        if (conflictingRegistration) {
          return {
            ok: false as const,
            code: 409,
            error: `You have already registered for ${conflictingRegistration.event.name} in this time slot.`,
          };
        }
      }

      if (!isTeamEvent && action !== "jointeam") {
        return { ok: false as const, code: 400, error: "Action is only supported for team events." };
      }

      if (!isTeamEvent && Number.isFinite(teamSizeInput) && Number(teamSizeInput) > 1) {
        return {
          ok: false as const,
          code: 400,
          error: "Team size is only allowed for team events.",
        };
      }

      if (!isTeamEvent) {
        const existing = await tx.eventRegistration.findUnique({
          where: {
            userId_eventId: {
              userId: user.id,
              eventId: event.id,
            },
          },
        });

        if (existing) {
          return { ok: true as const, code: 200, message: "Already registered for this event." };
        }

        const currentParticipants = await tx.eventRegistration.count({ where: { eventId: event.id } });
        if (event.maxParticipants != null && currentParticipants + 1 > event.maxParticipants) {
          return { ok: false as const, code: 409, error: "This event is full." };
        }

        await tx.eventRegistration.create({
          data: {
            userId: user.id,
            eventId: event.id,
            teamName: null,
            teamSize: 1,
            attended: false,
          },
        });

        return { ok: true as const, code: 200, message: "Registered successfully." };
      }

      if (!user.shacklesId) {
        return {
          ok: false as const,
          code: 403,
          error: "Shackles ID is required for team-event registration.",
        };
      }

      const existing = await tx.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId: user.id,
            eventId: event.id,
          },
        },
      });

      if (action === "createteam") {
        if (existing) {
          return { ok: true as const, code: 200, message: "You are already registered for this event." };
        }

        if (!teamNameInput) {
          return { ok: false as const, code: 400, error: "Team name is required." };
        }

        const normalizedTeam = normalizeTeamName(teamNameInput);
        const byName = await tx.team.findUnique({
          where: {
            eventId_nameNormalized: {
              eventId: event.id,
              nameNormalized: normalizedTeam,
            },
          },
        });

        if (byName) {
          return {
            ok: false as const,
            code: 409,
            error: "Team name already exists. Join with Team Code or choose another name.",
          };
        }

        const currentParticipants = await tx.eventRegistration.count({ where: { eventId: event.id } });
        if (event.maxParticipants != null && currentParticipants + 1 > event.maxParticipants) {
          return { ok: false as const, code: 409, error: "This event is full." };
        }

        const currentTeamCount = await tx.team.count({ where: { eventId: event.id } });
        if (event.maxTeams != null && currentTeamCount >= event.maxTeams) {
          return { ok: false as const, code: 409, error: "Team slots are full." };
        }

        const teamCode = await generateUniqueTeamCode(tx, event.id);

        const team = await tx.team.create({
          data: {
            eventId: event.id,
            name: teamNameInput,
            nameNormalized: normalizedTeam,
            teamCode,
            memberCount: 1,
            status: TeamStatus.DRAFT,
            leaderUserId: user.id,
            leaderContactPhoneSnapshot: user.phone,
            leaderContactEmailSnapshot: user.email,
          },
        });

        await tx.eventRegistration.create({
          data: {
            userId: user.id,
            eventId: event.id,
            teamId: team.id,
            memberRole: TeamMemberRole.LEADER,
            teamName: team.name,
            teamSize: 1,
            attended: false,
          },
        });

        return {
          ok: true as const,
          code: 200,
          message: `Team created. Share Team Code: ${team.teamCode}`,
          teamCode: team.teamCode,
        };
      }

      if (action === "sendinvite") {
        if (!inviteEmailInput) {
          return { ok: false as const, code: 400, error: "Invite email is required." };
        }

        const normalizedTeam = teamNameInput ? normalizeTeamName(teamNameInput) : "";
        const normalizedTeamCode = teamCodeInput ? normalizeTeamCode(teamCodeInput) : "";

        const team = normalizedTeamCode
          ? await tx.team.findUnique({
              where: {
                eventId_teamCode: {
                  eventId: event.id,
                  teamCode: normalizedTeamCode,
                },
              },
            })
          : normalizedTeam
          ? await tx.team.findUnique({
              where: {
                eventId_nameNormalized: {
                  eventId: event.id,
                  nameNormalized: normalizedTeam,
                },
              },
            })
          : null;

        if (!team) {
          return { ok: false as const, code: 404, error: "Team not found." };
        }

        if (team.leaderUserId !== user.id) {
          return { ok: false as const, code: 403, error: "Only team leader can send invites." };
        }

        if (team.status !== TeamStatus.DRAFT) {
          return { ok: false as const, code: 409, error: "Team is already locked." };
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const inviteToken = crypto.randomBytes(24).toString("hex");

        await tx.teamInvite.create({
          data: {
            teamId: team.id,
            token: inviteToken,
            invitedEmail: inviteEmailInput,
            invitedByUserId: user.id,
            expiresAt,
          },
        });

        const inviteToSend = {
          toEmail: inviteEmailInput,
          leaderName: deriveLeaderName(user.firstName, user.lastName, user.email),
          eventName: event.name,
          teamName: team.name,
          teamCode: team.teamCode,
          inviteToken,
          expiresAt,
        };

        return {
          ok: true as const,
          code: 200,
          message: "Invite prepared.",
          teamCode: team.teamCode,
          inviteToSend,
        };
      }

      const normalizedTeam = teamNameInput ? normalizeTeamName(teamNameInput) : "";
      const normalizedTeamCode = teamCodeInput ? normalizeTeamCode(teamCodeInput) : "";

      let inviteRecord:
        | {
            id: string;
            teamId: string;
            invitedEmail: string | null;
          }
        | null = null;

      let team = normalizedTeamCode
        ? await tx.team.findUnique({
            where: {
              eventId_teamCode: {
                eventId: event.id,
                teamCode: normalizedTeamCode,
              },
            },
          })
        : null;

      if (!team && inviteTokenInput) {
        const invite = await tx.teamInvite.findUnique({
          where: { token: inviteTokenInput },
          include: {
            team: true,
          },
        });

        if (!invite || invite.team.eventId !== event.id) {
          return { ok: false as const, code: 404, error: "Invite token is invalid." };
        }

        if (invite.usedAt) {
          return { ok: false as const, code: 409, error: "Invite token has already been used." };
        }

        if (invite.expiresAt.getTime() < Date.now()) {
          return { ok: false as const, code: 410, error: "Invite token has expired." };
        }

        if (invite.invitedEmail && invite.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
          return { ok: false as const, code: 403, error: "This invite was issued for a different email." };
        }

        team = invite.team;
        inviteRecord = {
          id: invite.id,
          teamId: invite.teamId,
          invitedEmail: invite.invitedEmail,
        };
      }

      if (!team && normalizedTeam) {
        team = await tx.team.findUnique({
          where: {
            eventId_nameNormalized: {
              eventId: event.id,
              nameNormalized: normalizedTeam,
            },
          },
        });
      }

      if (action === "completeteam") {
        if (!team) {
          return { ok: false as const, code: 404, error: "Team not found." };
        }

        if (team.status !== TeamStatus.DRAFT) {
          return {
            ok: false as const,
            code: 409,
            error: "Team registration is already completed and locked.",
          };
        }

        if (!team.leaderUserId || team.leaderUserId !== user.id) {
          return {
            ok: false as const,
            code: 403,
            error: "Only team leader can complete registration.",
          };
        }

        const teamMinSize = event.teamMinSize ?? 2;
        const teamMaxSize = event.teamMaxSize ?? 4;
        const memberCount = team.memberCount;

        if (memberCount < teamMinSize) {
          return {
            ok: false as const,
            code: 400,
            error: `At least ${teamMinSize} members are required to complete registration.`,
          };
        }

        if (memberCount > teamMaxSize) {
          return {
            ok: false as const,
            code: 400,
            error: `Team can have at most ${teamMaxSize} members.`,
          };
        }

        await tx.team.update({
          where: { id: team.id },
          data: {
            status: "LOCKED",
            lockedAt: new Date(),
            lockedBy: user.shacklesId,
          },
        });

        return {
          ok: true as const,
          code: 200,
          message: "Team registration completed and locked.",
          teamCode: team.teamCode,
        };
      }

      if (existing) {
        return { ok: true as const, code: 200, message: "Already registered for this event." };
      }

      if (!team) {
        return {
          ok: false as const,
          code: 404,
          error: "Team not found. Use Team Code / Invite Token, or create a team first.",
        };
      }

      if (team.status !== TeamStatus.DRAFT) {
        return {
          ok: false as const,
          code: 409,
          error: "Team registration is already completed and locked.",
        };
      }

      const currentParticipants = await tx.eventRegistration.count({ where: { eventId: event.id } });
      if (event.maxParticipants != null && currentParticipants + 1 > event.maxParticipants) {
        return { ok: false as const, code: 409, error: "This event is full." };
      }

      const maxTeamSize = event.teamMaxSize ?? 4;
      if (team.memberCount + 1 > maxTeamSize) {
        return {
          ok: false as const,
          code: 409,
          error: `Team can have at most ${maxTeamSize} participants.`,
        };
      }

      const memberRole = team.leaderUserId === user.id ? TeamMemberRole.LEADER : TeamMemberRole.MEMBER;

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          teamId: team.id,
          memberRole,
          teamName: team.name,
          teamSize: 1,
          attended: false,
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

      if (inviteRecord) {
        await tx.teamInvite.update({
          where: { id: inviteRecord.id },
          data: {
            usedAt: new Date(),
            usedByUserId: user.id,
          },
        });
      }

      return {
        ok: true as const,
        code: 200,
        message: "Registered successfully.",
        teamCode: team.teamCode,
      };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code });
    }

    const invitePayload = "inviteToSend" in result ? result.inviteToSend : null;

    if (invitePayload) {
      const emailResult = await sendTeamInviteEmail(invitePayload);
      if (!emailResult.success) {
        return NextResponse.json(
          {
            message: "Invite created, but email failed to send.",
            inviteLink: emailResult.inviteLink,
            warning: emailResult.error,
            teamCode: invitePayload.teamCode,
          },
          { status: 200 }
        );
      }

      return NextResponse.json({
        message: "Invite sent successfully.",
        teamCode: invitePayload.teamCode,
      });
    }

    revalidatePath("/userDashboard");
    revalidatePath("/admin/events");
    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/adminDashboard");
    revalidatePath("/events");
    revalidatePath("/events/technical");
    revalidatePath("/events/non-technical");
    revalidatePath("/events/special");
    revalidatePath("/workshops");

    return NextResponse.json({
      message: result.message,
      teamCode: "teamCode" in result ? result.teamCode : undefined,
    });
  } catch (error) {
    console.error("[events/register] failed:", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
