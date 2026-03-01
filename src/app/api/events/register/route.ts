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

      const currentCount = await tx.eventRegistration.count({
        where: { eventId: event.id },
      });

      if (event.maxParticipants != null && currentCount >= event.maxParticipants) {
        return { ok: false as const, code: 409, error: "This event is full." };
      }

      await tx.eventRegistration.create({
        data: {
          userId: user.id,
          eventId: event.id,
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

    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error("[events/register] failed:", error);
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 });
  }
}
