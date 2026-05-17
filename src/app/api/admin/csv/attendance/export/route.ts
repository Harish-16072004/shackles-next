import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stringifyCsvRow } from "@/lib/csv";
import { logAdminAudit } from "@/lib/admin-audit";
import { createRateLimiter } from "@/lib/rate-limit";

const attendanceExportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  keyPrefix: "api:admin:csv:attendance:export",
});

async function getAdminOrCoordinatorContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || (user.role !== "ADMIN" && user.role !== "COORDINATOR")) return null;
  return { id: user.id, email: user.email, role: user.role };
}

function toSafeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "event";
}

export async function GET(request: Request) {
  const admin = await getAdminOrCoordinatorContext();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const rateLimitResult = await attendanceExportRateLimiter.limit(`admin:csv:attendance:export:${admin.id}`);
  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitResult.reset - Date.now()) / 1000));
    return Response.json(
      { error: "Too many attendance export requests. Please try again later." },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": "30",
          "x-ratelimit-remaining": String(rateLimitResult.remaining),
          "x-ratelimit-reset": String(rateLimitResult.reset),
          "retry-after": String(retryAfterSeconds),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId")?.trim() || "";

  if (!eventId) {
    return new Response("eventId is required", { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, type: true, date: true, participationMode: true },
  });

  if (!event) {
    return new Response("Event not found", { status: 404 });
  }

  const registrations = await prisma.eventRegistration.findMany({
    where: { eventId: event.id },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          collegeName: true,
          department: true,
          shacklesId: true,
        },
      },
      team: {
        select: {
          name: true,
          teamCode: true,
          status: true,
        },
      },
    },
    orderBy: [{ attended: "desc" }, { user: { firstName: "asc" } }],
  });

  const lines = [
    stringifyCsvRow([
      "S.No",
      "Name",
      "Email",
      "Phone",
      "College",
      "Department",
      "ShacklesID",
      "TeamName",
      "TeamCode",
      "Role",
      "Attended",
      "AttendedAt",
    ]),
    ...registrations.map((reg, idx) =>
      stringifyCsvRow([
        idx + 1,
        `${reg.user.firstName} ${reg.user.lastName}`.trim(),
        reg.user.email,
        reg.user.phone || "",
        reg.user.collegeName || "",
        reg.user.department || "",
        reg.user.shacklesId || "",
        reg.team?.name || reg.teamName || "",
        reg.team?.teamCode || "",
        reg.memberRole || "INDIVIDUAL",
        reg.attended ? "YES" : "NO",
        reg.attendedAt ? reg.attendedAt.toISOString() : "",
      ])
    ),
  ];

  await logAdminAudit({
    action: "CSV_ATTENDANCE_EXPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    status: "SUCCESS",
    details: {
      eventId: event.id,
      eventName: event.name,
      totalRows: registrations.length,
      attended: registrations.filter((r) => r.attended).length,
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  const fileName = `attendance-${toSafeSlug(event.name)}-${date}.csv`;

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(`${fileName}`)}`,
      "Cache-Control": "no-store",
    },
  });
}
