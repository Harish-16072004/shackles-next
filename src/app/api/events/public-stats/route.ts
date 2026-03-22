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
            isActive: true,
            type: {
              equals: rawCategory,
              mode: "insensitive",
            },
          }
        : {
            isActive: true,
          },
      select: {
        id: true,
        name: true,
        type: true,
        dayLabel: true,
        date: true,
        endDate: true,
        description: true,
        rulesUrl: true,
        coordinatorName: true,
        coordinatorPhone: true,
        trainerName: true,
        contactName: true,
        contactPhone: true,
        participationMode: true,
        isAllDay: true,
        teamMinSize: true,
        teamMaxSize: true,
        maxTeams: true,
        maxParticipants: true,
        isActive: true,
      },
      orderBy: [{ date: "asc" }, { name: "asc" }],
    });

    const eventIds = events.map((event) => event.id);

    const [teamCounts, registrationRowCounts, teamMemberCounts, individualParticipantSums] = eventIds.length
      ? await Promise.all([
          prisma.team.groupBy({
            by: ["eventId"],
            where: { eventId: { in: eventIds } },
            _count: { id: true },
          }),
          prisma.eventRegistration.groupBy({
            by: ["eventId"],
            where: { eventId: { in: eventIds } },
            _count: { id: true },
          }),
          prisma.eventRegistration.groupBy({
            by: ["eventId"],
            where: {
              eventId: { in: eventIds },
              teamId: { not: null },
            },
            _count: { id: true },
          }),
          prisma.eventRegistration.groupBy({
            by: ["eventId"],
            where: {
              eventId: { in: eventIds },
              teamId: null,
            },
            _sum: { teamSize: true },
          }),
        ])
      : [[], [], [], []];

    const teamCountByEventId = new Map(teamCounts.map((entry) => [entry.eventId, entry._count?.id ?? 0]));
    const registrationRowsByEventId = new Map(registrationRowCounts.map((entry) => [entry.eventId, entry._count?.id ?? 0]));
    const teamMembersByEventId = new Map(teamMemberCounts.map((entry) => [entry.eventId, entry._count?.id ?? 0]));
    const individualSumsByEventId = new Map(individualParticipantSums.map((entry) => [entry.eventId, entry._sum.teamSize ?? 0]));

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
      registeredCount:
        (teamMembersByEventId.get(event.id) ?? 0) +
        (individualSumsByEventId.get(event.id) ?? 0),
      registeredTeams:
        event.participationMode === "TEAM"
          ? teamCountByEventId.get(event.id) ?? 0
          : registrationRowsByEventId.get(event.id) ?? 0,
      teamsLeft:
        event.maxTeams == null
          ? null
          : Math.max(
              event.maxTeams -
                (event.participationMode === "TEAM"
                  ? teamCountByEventId.get(event.id) ?? 0
                  : registrationRowsByEventId.get(event.id) ?? 0),
              0
            ),
      spotsLeft:
        event.maxParticipants == null
          ? null
          : Math.max(
              event.maxParticipants -
                ((teamMembersByEventId.get(event.id) ?? 0) +
                  (individualSumsByEventId.get(event.id) ?? 0)),
              0
            ),
    }));

    return NextResponse.json({ events: payload });
  } catch (error) {
    console.error("[events/public-stats] failed:", error);
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
