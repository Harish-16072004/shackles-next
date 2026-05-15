'use server'

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import EventRegistrationCard from "@/components/features/admin/EventRegistrationCard";

export default async function AdminEventRegistrationsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || (user.role !== "ADMIN" && user.role !== "VOLUNTEER" && user.role !== "COORDINATOR")) redirect("/login");

  let allowedEventIds: string[] | null = null;
  if (user.role !== "ADMIN") {
    // Only fetch events assigned to this coordinator
    const assignments = await prisma.eventStaffAssignment.findMany({
      where: {
        userId: user.id,
        staffRole: "COORDINATOR",
      },
      select: { eventId: true },
    });
    allowedEventIds = assignments.map((a) => a.eventId);
    if (allowedEventIds.length === 0) {
      // Coordinator has no assigned events
      allowedEventIds = ["NONE"]; // Use a dummy ID to force empty results
    }
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const typeFilter = typeof resolvedSearchParams?.type === "string" ? resolvedSearchParams.type : "";
  const q = typeof resolvedSearchParams?.q === "string" ? resolvedSearchParams.q.trim() : "";
  const success = typeof resolvedSearchParams?.success === "string" ? resolvedSearchParams.success : "";
  const error = typeof resolvedSearchParams?.error === "string" ? resolvedSearchParams.error : "";

  const events = await prisma.event.findMany({
    where: allowedEventIds ? { id: { in: allowedEventIds } } : undefined,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      date: true,
      endDate: true,
      participationMode: true,
      registrations: {
        select: {
          id: true,
          userId: true,
          eventId: true,
          teamName: true,
          attended: true,
          attendedAt: true,
          teamId: true,
          teamSize: true,
          memberRole: true,
          user: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              collegeName: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              leaderUserId: true,
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
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <LiveSyncRefresher intervalMs={12000} />
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Event Registrations</h1>
            <p className="text-gray-500 text-sm mt-1">Manage participants across all events.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-semibold text-gray-900">{totals.registrations} registrations</span>
            <span className="text-gray-400">·</span>
            <span className="text-gray-600">{totals.events} events</span>
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
              {user.role === 'ADMIN' && (
                <a
                  href="/admin/events"
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  View all events
                </a>
              )}
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

        <div className="flex items-center gap-3">
          <a
            href="/api/admin/csv/registrations/export"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export All CSV
          </a>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-500">
            No registrations found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filtered.map((evt) => (
              <EventRegistrationCard key={evt.id} event={evt as any} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
