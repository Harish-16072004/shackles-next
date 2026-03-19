import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawCategory = searchParams.get("category")?.trim();

    const events = await prisma.event.findMany({
      where: rawCategory
        ? {
            type: {
              equals: rawCategory,
              mode: "insensitive",
            },
          }
        : undefined,
      include: {
        registrations: {
          select: {
            teamSize: true,
            teamId: true,
          },
        },
        teams: {
          select: { id: true },
        },
      },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    });

    const payload = events.map((event) => ({
      id: event.id,
      name: event.name,
      type: event.type,
      dayLabel: event.dayLabel,
      date: event.date,
      endDate: event.endDate,
      description: event.description,
      rulesUrl: event.rulesUrl,
      coordinatorName: event.coordinatorName,
      coordinatorPhone: event.coordinatorPhone,
      trainerName: event.trainerName,
      contactName: event.contactName,
      contactPhone: event.contactPhone,
      participationMode: event.participationMode,
      isAllDay: event.isAllDay,
      teamMinSize: event.teamMinSize,
      teamMaxSize: event.teamMaxSize,
      maxTeams: event.maxTeams,
      maxParticipants: event.maxParticipants,
      isActive: event.isActive,
      registeredTeams:
        event.participationMode === "TEAM"
          ? event.teams.length
          : event.registrations.length,
      registeredCount: event.registrations.reduce(
        (sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1),
        0
      ),
      teamsLeft:
        event.maxTeams == null
          ? null
          : Math.max(
              event.maxTeams -
                (event.participationMode === "TEAM"
                  ? event.teams.length
                  : event.registrations.length),
              0
            ),
      spotsLeft:
        event.maxParticipants == null
          ? null
          : Math.max(
              event.maxParticipants -
                event.registrations.reduce((sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1), 0),
              0
            ),
    }));

    return NextResponse.json({ events: payload });
  } catch (error) {
    console.error("[events/public-stats] failed:", error);
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
