'use server'

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { readAdminAuditLogs } from "@/lib/admin-audit-read";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";

type Params = Record<string, string | string[] | undefined>;

function buildQuery(input: Record<string, string | undefined>) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(input).filter(([, value]) => Boolean(value))) as Record<string, string>
  ).toString();
}

function getFailureReason(details: Record<string, unknown> | undefined) {
  if (!details) return "UNKNOWN";
  const value = details.reason;
  if (typeof value !== "string" || value.trim().length === 0) return "UNKNOWN";
  return value.trim().toUpperCase();
}

export default async function AdminAuditLogsPage({ searchParams }: { searchParams?: Params }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  if (!user || user.role !== "ADMIN") redirect("/login");

  const action = typeof searchParams?.action === "string" ? searchParams.action : "";
  const status = typeof searchParams?.status === "string" ? searchParams.status : "";
  const dateFrom = typeof searchParams?.dateFrom === "string" ? searchParams.dateFrom : "";
  const dateTo = typeof searchParams?.dateTo === "string" ? searchParams.dateTo : "";
  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";

  const records = await readAdminAuditLogs({ action, status, dateFrom, dateTo, q, limit: 1000 });
  const actionOptions = Array.from(new Set(records.map((record) => record.action))).sort();

  const scannerAction = "SCANNER_TEAM_BULK_REGISTER";
  const scannerRecords = records.filter((record) => record.action === scannerAction);
  const scannerSuccessCount = scannerRecords.filter((record) => record.status === "SUCCESS").length;
  const scannerFailureCount = scannerRecords.length - scannerSuccessCount;

  const scannerFailureReasonCounts = scannerRecords
    .filter((record) => record.status !== "SUCCESS")
    .reduce((acc, record) => {
      const reason = getFailureReason(record.details);
      acc.set(reason, (acc.get(reason) || 0) + 1);
      return acc;
    }, new Map<string, number>());

  const scannerFailureReasons = Array.from(scannerFailureReasonCounts.entries()).sort((a, b) => b[1] - a[1]);

  const exportQuery = buildQuery({ action, status, dateFrom, dateTo, q });
  const scannerPresetQuery = buildQuery({ action: scannerAction, status, dateFrom, dateTo });
  const scannerFailurePresetQuery = buildQuery({ action: scannerAction, status: "FAILED", dateFrom, dateTo });

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <LiveSyncRefresher intervalMs={20000} />
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-sm text-gray-600">Track admin event and CSV operations with timestamps and actor context.</p>
          </div>
          <a
            href={`/api/admin/csv/audit/export${exportQuery ? `?${exportQuery}` : ""}`}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Export Filtered CSV
          </a>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <form method="get" className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <select
              name="action"
              defaultValue={action}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All Actions</option>
              {actionOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
            </select>
            <input
              type="date"
              name="dateFrom"
              defaultValue={dateFrom}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="date"
              name="dateTo"
              defaultValue={dateTo}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search actor, target, details"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-2">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Apply</button>
              <a href="/admin/audit-logs" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">Reset</a>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Scanner Bulk Rollout</h2>
              <p className="text-xs text-gray-500">Preset views and failure reason counts for scanner team bulk registration.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`/admin/audit-logs${scannerPresetQuery ? `?${scannerPresetQuery}` : ""}`}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Scanner Bulk Only
              </a>
              <a
                href={`/admin/audit-logs${scannerFailurePresetQuery ? `?${scannerFailurePresetQuery}` : ""}`}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Scanner Bulk Failures
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Total</div>
              <div className="text-2xl font-bold text-gray-900">{scannerRecords.length}</div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Success</div>
              <div className="text-2xl font-bold text-emerald-700">{scannerSuccessCount}</div>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="text-xs uppercase tracking-wide text-red-700">Failed</div>
              <div className="text-2xl font-bold text-red-700">{scannerFailureCount}</div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2">Failure Reasons</h3>
            {scannerFailureReasons.length === 0 ? (
              <p className="text-xs text-gray-500">No scanner bulk failures in current filter range.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {scannerFailureReasons.map(([reason, count]) => (
                  <a
                    key={reason}
                    href={`/admin/audit-logs?${buildQuery({ action: scannerAction, status: "FAILED", dateFrom, dateTo, q: reason })}`}
                    className="rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    {reason}: {count}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((record, index) => (
                  <tr key={`${record.timestamp}-${record.action}-${record.actorId}-${index}`} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{new Date(record.timestamp).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{record.action}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="font-medium text-gray-900">{record.actorEmail || "--"}</div>
                      <div className="text-xs text-gray-500">{record.actorId}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{record.target || "--"}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{record.status || "--"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 max-w-[380px] break-words">
                      {record.details ? JSON.stringify(record.details) : "--"}
                    </td>
                  </tr>
                ))}

                {records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-500">No audit entries found for current filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
