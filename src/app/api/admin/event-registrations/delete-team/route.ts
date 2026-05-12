import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { createRateLimiter } from "@/lib/rate-limit";

const adminDeleteTeamRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: "api:admin:event-registrations:delete-team",
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

  const rateLimitResult = await adminDeleteTeamRateLimiter.limit(`admin:event-registrations:delete-team:${adminUserId}`);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many delete-team attempts. Please try again later." },
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
  const teamId = String(formData.get("teamId") || "").trim();

  if (!teamId) {
    return Response.redirect(new URL("/admin/event-registrations?error=missing-team", request.url), 303);
  }

  const existingTeam = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!existingTeam) {
    return Response.redirect(new URL("/admin/event-registrations?error=team-not-found", request.url), 303);
  }

  await prisma.$transaction(async (tx) => {
    await tx.eventRegistration.deleteMany({ where: { teamId } });
    await tx.team.delete({ where: { id: teamId } });
  });

  revalidatePath("/admin/event-registrations", "layout");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  const redirectUrl = formData.get("eventId")
    ? `/admin/event-registrations/${formData.get("eventId")}?success=team-deleted`
    : "/admin/event-registrations?success=team-deleted";

  return Response.redirect(new URL(redirectUrl, request.url), 303);
}
