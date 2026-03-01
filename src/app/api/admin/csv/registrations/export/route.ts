import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    include: {
      event: true,
      user: true,
    },
    orderBy: [{ event: { name: "asc" } }, { user: { firstName: "asc" } }],
  });

  const lines = [
    stringifyCsvRow([
      "eventName",
      "eventType",
      "userEmail",
      "userFirstName",
      "userLastName",
      "teamName",
      "teamSize",
      "attended",
      "attendedAt",
    ]),
    ...registrations.map((registration) =>
      stringifyCsvRow([
        registration.event.name,
        registration.event.type,
        registration.user.email,
        registration.user.firstName,
        registration.user.lastName,
        registration.teamName,
        registration.teamSize,
        registration.attended,
        registration.attendedAt ? registration.attendedAt.toISOString() : "",
      ])
    ),
  ];

  await logAdminAudit({
    action: "CSV_REGISTRATIONS_EXPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: { rows: registrations.length },
  });

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
