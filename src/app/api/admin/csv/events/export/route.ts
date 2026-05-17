import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";
import { createRateLimiter } from "@/lib/rate-limit";

const adminEventsExportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 20,
  keyPrefix: "api:admin:csv:events:export",
});

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateCell(date?: Date | null) {
  if (!date) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeCell(date?: Date | null) {
  if (!date) return "";
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export async function GET() {
  const admin = await getAdminContext();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitResult = await adminEventsExportRateLimiter.limit(`admin:csv:events:export:${admin.id}`);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many events export requests. Please try again later." },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": "20",
          "x-ratelimit-remaining": String(rateLimitResult.remaining),
          "x-ratelimit-reset": String(rateLimitResult.reset),
          "retry-after": String(retryAfterSeconds),
        },
      }
    );
  }

  const activeYear = getActiveYear();
  const events = await prisma.event.findMany({
    where: {
      year: activeYear,
    },
    orderBy: [{ name: "asc" }],
  });

  const lines = [
    stringifyCsvRow([
      "name",
      "year",
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
    ...events.map((event) =>
      stringifyCsvRow([
        event.name,
        event.year,
        event.type,
        event.dayLabel,
        toDateCell(event.date),
        toTimeCell(event.date),
        toDateCell(event.endDate),
        toTimeCell(event.endDate),
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
        event.isAllDay,
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
      "Content-Disposition": `attachment; filename="events-export-${new Date().toISOString().slice(0, 10)}.csv"; filename*=UTF-8''${encodeURIComponent(`events-export-${new Date().toISOString().slice(0, 10)}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}
