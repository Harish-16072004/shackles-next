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

  const events = await prisma.event.findMany({
    orderBy: [{ name: "asc" }],
  });

  const lines = [
    stringifyCsvRow([
      "name",
      "type",
      "dayLabel",
      "date",
      "description",
      "rulesUrl",
      "coordinatorName",
      "coordinatorPhone",
      "trainerName",
      "contactName",
      "contactPhone",
      "participationMode",
      "teamMinSize",
      "teamMaxSize",
      "maxTeams",
      "maxParticipants",
      "isActive",
    ]),
    ...events.map((event) =>
      stringifyCsvRow([
        event.name,
        event.type,
        event.dayLabel,
        event.date ? event.date.toISOString().slice(0, 10) : "",
        event.description,
        event.rulesUrl,
        event.coordinatorName,
        event.coordinatorPhone,
        event.trainerName,
        event.contactName,
        event.contactPhone,
        event.participationMode,
        event.teamMinSize,
        event.teamMaxSize,
        event.maxTeams,
        event.maxParticipants,
        event.isActive,
      ])
    ),
  ];

  await logAdminAudit({
    action: "CSV_EVENTS_EXPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: { rows: events.length },
  });

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="events-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
