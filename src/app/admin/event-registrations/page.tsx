'use server'

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import { MemberDeleteForm, TeamDeleteForm } from "@/components/features/admin/EventRegistrationDeleteForms";

export default async function AdminEventRegistrationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || user.role !== "ADMIN") redirect("/login");

  const typeFilter = typeof searchParams?.type === "string" ? searchParams.type : "";
  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const success = typeof searchParams?.success === "string" ? searchParams.success : "";
  const error = typeof searchParams?.error === "string" ? searchParams.error : "";

  const events = await prisma.event.findMany({
    orderBy: { name: "asc" },
    include: {
      registrations: {
        include: {
          user: true,
          team: {
            include: {
              leader: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const filtered = events
    .filter((evt) => {
      if (!typeFilter) return true;
      const t = (evt.type || "").toLowerCase();
      if (typeFilter === "TECHNICAL") return t === "technical";
      if (typeFilter === "NON-TECHNICAL") return t === "non-technical";
      if (typeFilter === "WORKSHOP") return t.includes("workshop") || evt.name.toLowerCase().includes("workshop");
      if (typeFilter === "SPECIAL") return t === "special";
      return true;
    })
    .map((evt) => {
      const regs = evt.registrations.filter((reg) => {
        if (!q) return true;
        const u = reg.user;
        const haystack = `${u.firstName} ${u.lastName} ${u.email} ${u.collegeName}`.toLowerCase();
        return haystack.includes(q.toLowerCase());
      });
      return { ...evt, registrations: regs };
    });

  const totals = filtered.reduce(
    (acc, evt) => {
      acc.registrations += evt.registrations.reduce(
        (sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1),
        0
      );
      acc.events += 1;
      return acc;
    },
    { registrations: 0, events: 0 }
  );

  const typeOptions = [
    { label: "All Types", value: "" },
    { label: "Technical", value: "TECHNICAL" },
    { label: "Non-Technical", value: "NON-TECHNICAL" },
    { label: "Workshop", value: "WORKSHOP" },
    { label: "Special", value: "SPECIAL" },
  ];

  const quickChips = [
    { label: "All", value: "" },
    { label: "Technical", value: "TECHNICAL" },
    { label: "Non-Technical", value: "NON-TECHNICAL" },
    { label: "Workshop", value: "WORKSHOP" },
    { label: "Special", value: "SPECIAL" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <LiveSyncRefresher intervalMs={12000} />
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Event Registrations</h1>
            <p className="text-gray-600">Filter by event type and search participants.</p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <div className="font-semibold text-gray-900">Total Registrations: {totals.registrations}</div>
            <div>Events: {totals.events}</div>
          </div>
        </div>

        {success ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success === "team-deleted" && "Team deleted successfully."}
            {success === "member-deleted" && "Team member deleted successfully."}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error === "missing-team" && "Team id is missing."}
            {error === "team-not-found" && "Team not found."}
            {error === "missing-registration" && "Registration id is missing."}
            {error === "registration-not-found" && "Registration not found."}
          </div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <form className="grid grid-cols-1 md:grid-cols-3 gap-3" method="get">
            <select
              name="type"
              defaultValue={typeFilter}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Name, email, or college"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800"
              >
                Apply
              </button>
              <a
                href="/admin/events"
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                View all events
              </a>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickChips.map((chip) => {
              const isActive = typeFilter === chip.value;
              return (
                <a
                  key={chip.label}
                  href={`/admin/event-registrations?${new URLSearchParams({ ...(chip.value ? { type: chip.value } : {}), ...(q ? { q } : {}) }).toString()}`}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    isActive ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {chip.label}
                </a>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
            <h2 className="text-lg font-bold text-gray-900">CSV Export</h2>
            <p className="text-sm text-gray-600">Download all event registrations with team and attendance fields.</p>
            <a
              href="/api/admin/csv/registrations/export"
              className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download Registrations CSV
            </a>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
            <h2 className="text-lg font-bold text-gray-900">CSV Import</h2>
            <p className="text-sm text-gray-600">Upload registrations CSV (eventName + userEmail required) to bulk upsert rows.</p>
            <form action="/api/admin/csv/registrations/import" method="post" encType="multipart/form-data" className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                type="file"
                name="file"
                required
                accept=".csv,text/csv"
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-50"
              />
              <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" name="dryRun" value="true" /> Dry run
              </label>
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                Import
              </button>
            </form>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No registrations found.</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Registrations</th>
                    <th className="px-4 py-3">Attendance CSV</th>
                    <th className="px-4 py-3">Participants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((evt) => {
                    const teamMap = new Map<string, { id: string; name: string; memberCount: number }>();
                    for (const reg of evt.registrations) {
                      if (!reg.teamId) continue;
                      const existing = teamMap.get(reg.teamId);
                      if (existing) {
                        existing.memberCount += 1;
                        continue;
                      }

                      teamMap.set(reg.teamId, {
                        id: reg.teamId,
                        name: reg.team?.name || reg.teamName || "Team",
                        memberCount: 1,
                      });
                    }

                    const teamsInEvent = Array.from(teamMap.values());

                    return (
                      <tr key={evt.id} className="align-top">
                        <td className="px-4 py-3 font-semibold text-gray-900">{evt.name}</td>
                        <td className="px-4 py-3 text-gray-700">{evt.type || "--"}</td>
                        <td className="px-4 py-3 text-gray-900 font-semibold">
                          {evt.registrations.reduce((sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1), 0)}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={`/api/admin/csv/registrations/export?eventId=${encodeURIComponent(evt.id)}`}
                            className="inline-flex rounded-sm border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Download CSV
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {evt.registrations.length === 0 ? (
                            <span className="text-gray-400 text-xs">No participants</span>
                          ) : (
                            <div className="space-y-3">
                              {teamsInEvent.length > 0 ? (
                                <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-2">
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Teams</p>
                                  <ul className="space-y-1 text-xs text-gray-800">
                                    {teamsInEvent.map((team) => (
                                      <li key={team.id} className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-gray-900">{team.name} ({team.memberCount})</span>
                                        <TeamDeleteForm teamId={team.id} teamName={team.name} />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              <ul className="space-y-1 text-xs text-gray-800">
                                {evt.registrations.map((reg) => (
                                  <li key={reg.id} className="flex items-center justify-between gap-2 rounded-sm border border-gray-100 px-2 py-1">
                                    <div className="min-w-0">
                                      <p className="font-semibold text-gray-900">{reg.user.firstName} {reg.user.lastName}</p>
                                      <p className="text-gray-500">
                                        {reg.teamName ? `${reg.teamName} • ` : ""}
                                        {reg.memberRole === "LEADER" || reg.team?.leaderUserId === reg.userId ? "Leader" : "Member"}
                                      </p>
                                    </div>
                                    <MemberDeleteForm
                                      registrationId={reg.id}
                                      fullName={`${reg.user.firstName} ${reg.user.lastName}`}
                                      hasTeam={Boolean(reg.teamId)}
                                    />
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
