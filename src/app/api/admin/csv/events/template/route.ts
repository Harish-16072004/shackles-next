import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id };
}

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const lines = [
    stringifyCsvRow([
      "name",
      "type",
      "dayLabel",
      "date",
      "time",
      "endDate",
      "endTime",
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
      "isAllDay",
      "isActive",
    ]),
    stringifyCsvRow([
      "Sample Event",
      "TECHNICAL",
      "DAY1",
      "2026-03-25",
      "09:00",
      "2026-03-25",
      "16:00",
      "This is a sample event description.",
      "https://example.com/rules",
      "John Doe | Jane Smith",
      "9876543210 | 9876543211",
      "",
      "",
      "",
      "TEAM",
      "2",
      "4",
      "50",
      "200",
      "false",
      "true",
    ]),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="events-import-template-${new Date().toISOString().slice(0, 10)}.csv"; filename*=UTF-8''${encodeURIComponent(`events-import-template-${new Date().toISOString().slice(0, 10)}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
