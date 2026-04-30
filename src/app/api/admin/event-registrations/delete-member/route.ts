import { revalidatePath } from "next/cache";
import { TeamMemberRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";

const adminDeleteMemberRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "api:admin:event-registrations:delete-member",
});

async function getAdminUserId() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN" ? user.id : null;
}

export async function POST(request: Request) {
  const adminUserId = await getAdminUserId();
  if (!adminUserId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitResult = await adminDeleteMemberRateLimiter.limit(`admin:event-registrations:delete-member:${adminUserId}`);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many delete-member attempts. Please try again later." },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": "10",
          "x-ratelimit-remaining": String(rateLimitResult.remaining),
          "x-ratelimit-reset": String(rateLimitResult.reset),
          "retry-after": String(retryAfterSeconds),
        },
      }
    );
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
