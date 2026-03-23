import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { readAdminAuditLogs } from "@/lib/admin-audit-read";
import { stringifyCsvRow } from "@/lib/csv";

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN";
}

export async function GET(request: Request) {
  const isAdmin = await assertAdmin();
  if (!isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "";
  const status = searchParams.get("status") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";
  const q = searchParams.get("q") || "";

  const records = await readAdminAuditLogs({ action, status, dateFrom, dateTo, q, limit: 10000 });

  const lines = [
    stringifyCsvRow(["timestamp", "action", "actorEmail", "actorId", "target", "status", "details"]),
    ...records.map((record) =>
      stringifyCsvRow([
        record.timestamp,
        record.action,
        record.actorEmail,
        record.actorId,
        record.target,
        record.status,
        record.details ? JSON.stringify(record.details) : "",
      ])
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
