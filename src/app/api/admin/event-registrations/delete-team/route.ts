import { revalidatePath } from "next/cache";
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

  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/events");
  revalidatePath("/admin/adminDashboard");
  revalidatePath("/userDashboard");
  revalidatePath("/events");
  revalidatePath("/workshops");

  return Response.redirect(new URL("/admin/event-registrations?success=team-deleted", request.url), 303);
}
