import { revalidatePath } from "next/cache";
import { TeamMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN";
}

export async function POST(request: Request) {
  const isAdmin = await assertAdmin();
  if (!isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const registrationId = String(formData.get("registrationId") || "").trim();

  if (!registrationId) {
    return Response.redirect(new URL("/admin/event-registrations?error=missing-registration", request.url), 303);
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      teamId: true,
      userId: true,
      memberRole: true,
    },
  });

  if (!registration) {
    return Response.redirect(new URL("/admin/event-registrations?error=registration-not-found", request.url), 303);
  }

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

  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  return Response.redirect(new URL("/admin/event-registrations?success=member-deleted", request.url), 303);
}
