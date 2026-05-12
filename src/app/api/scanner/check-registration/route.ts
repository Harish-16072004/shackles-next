import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkEventStaff } from "@/lib/session";
import { Permission } from "@prisma/client";
import { normalizeShacklesId } from "@/server/services/team-registration.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shacklesId = searchParams.get("shacklesId");
    const eventId = searchParams.get("eventId");

    if (!shacklesId || !eventId) {
      return NextResponse.json(
        { success: false, error: "Missing shacklesId or eventId" },
        { status: 400 }
      );
    }

    // Authorize access to this event
    const { allowed, error } = await checkEventStaff(eventId, Permission.SCAN_ATTENDANCE);
    if (!allowed) {
      return NextResponse.json({ success: false, error: error || "Forbidden" }, { status: 403 });
    }

    // Find user by shacklesId
    const normalizedId = normalizeShacklesId(shacklesId);
    const user = await prisma.user.findUnique({
      where: { shacklesId: normalizedId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shacklesId: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Participant not found" },
        { status: 404 }
      );
    }

    // Check if already registered for this event
    const registration = await prisma.eventRegistration.findFirst({
      where: { userId: user.id, eventId },
      select: { id: true },
    });

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        type: true,
        participationMode: true,
        teamMinSize: true,
        teamMaxSize: true,
      },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      registered: !!registration,
      participant: {
        name: `${user.firstName} ${user.lastName}`.trim(),
        shacklesId: user.shacklesId,
      },
      event: {
        id: event.id,
        name: event.name,
        type: event.type,
        participationMode: event.participationMode,
        minTeamSize: event.teamMinSize,
        maxTeamSize: event.teamMaxSize,
      },
    });
  } catch (error) {
    console.error("Check Registration Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
