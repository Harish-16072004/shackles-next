import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function normalizeName(name: string) {
  return name.trim().toUpperCase();
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
    const teamSizeInput = typeof body?.teamSize === "number" ? body.teamSize : Number(body?.teamSize);

    if (!eventName) {
      return NextResponse.json({ error: "Event name is required." }, { status: 400 });
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
      const inferredTeamSize = Number.isFinite(teamSizeInput)
        ? Number(teamSizeInput)
        : isTeamEvent
        ? event.teamMinSize || event.teamMaxSize || 1
        : 1;

      if (!Number.isFinite(inferredTeamSize) || inferredTeamSize < 1) {
        return { ok: false as const, code: 400, error: "Invalid team size." };
      }

      if (isTeamEvent) {
        if (event.teamMinSize != null && inferredTeamSize < event.teamMinSize) {
          return {
            ok: false as const,
            code: 400,
            error: `Team must have at least ${event.teamMinSize} participants.`,
          };
        }
        if (event.teamMaxSize != null && inferredTeamSize > event.teamMaxSize) {
          return {
            ok: false as const,
            code: 400,
            error: `Team can have at most ${event.teamMaxSize} participants.`,
          };
        }
      }

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

      const currentTeams = await tx.eventRegistration.count({
        where: { eventId: event.id },
      });

      if (event.maxTeams != null && currentTeams >= event.maxTeams) {
        return { ok: false as const, code: 409, error: "Team slots are full." };
      }

      const participantAggregate = await tx.eventRegistration.aggregate({
        where: { eventId: event.id },
        _sum: { teamSize: true },
      });
      const currentParticipants = participantAggregate._sum.teamSize || 0;

      if (event.maxParticipants != null && currentParticipants + inferredTeamSize > event.maxParticipants) {
        return { ok: false as const, code: 409, error: "This event is full." };
      }

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
          teamName: teamNameInput || null,
          teamSize: inferredTeamSize,
          attended: false,
        },
      });

      return { ok: true as const, code: 200, message: "Registered successfully." };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.code });
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

    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error("[events/register] failed:", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
