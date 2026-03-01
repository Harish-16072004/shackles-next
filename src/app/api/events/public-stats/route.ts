import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        _count: {
          select: {
            registrations: true,
          },
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
      maxParticipants: event.maxParticipants,
      isActive: event.isActive,
      registeredCount: event._count.registrations,
      spotsLeft:
        event.maxParticipants == null
          ? null
          : Math.max(event.maxParticipants - event._count.registrations, 0),
    }));

    return NextResponse.json({ events: payload });
  } catch (error) {
    console.error("[events/public-stats] failed:", error);
    return NextResponse.json({ events: [] }, { status: 500 });
  }
}
