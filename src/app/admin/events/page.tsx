'use server'

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { EventParticipationMode, type Prisma } from "@prisma/client";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import { logAdminAudit } from "@/lib/admin-audit";
import { getActiveYear } from "@/lib/edition";
import { archiveEventById, restoreEventById } from "@/server/services/event-archive.service";

const EVENT_TYPE_OPTIONS = [
  { value: "TECHNICAL", label: "Technical" },
  { value: "NON-TECHNICAL", label: "Non Technical" },
  { value: "SPECIAL", label: "Special" },
];

const DAY_LABEL_OPTIONS = [
  { value: "DAY1", label: "Day 1" },
  { value: "DAY2", label: "Day 2" },
];

function formatDate(date?: Date | null) {
  if (!date) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateRange(start?: Date | null, end?: Date | null) {
  if (!start) return "--";
  if (!end || end.getTime() === start.getTime()) return formatDate(start);
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function toDateTimeLocalValue(date?: Date | null) {
  if (!date) return "";
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitCoordinatorField(value?: string | null) {
  const parts = (value || "")
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  return [parts[0] || "", parts[1] || "", parts[2] || ""] as const;
}

function parseCoordinators(formData: FormData) {
  const entries = [1, 2, 3].map((index) => ({
    name: (formData.get(`coordinatorName${index}`) as string | null)?.trim() || "",
    phone: (formData.get(`coordinatorPhone${index}`) as string | null)?.trim() || "",
  }));

  const first = entries[0];
  if (!first.name || !first.phone) {
    return null;
  }

  for (const entry of entries.slice(1)) {
    const hasName = Boolean(entry.name);
    const hasPhone = Boolean(entry.phone);
    if (hasName !== hasPhone) {
      return null;
    }
  }

  const normalized = entries.filter((entry) => entry.name && entry.phone);

  return {
    coordinatorName: normalized.map((entry) => entry.name).join(" | "),
    coordinatorPhone: normalized.map((entry) => entry.phone).join(" | "),
  };
}

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || user.role !== "ADMIN") redirect("/login");
  return user;
}

function revalidateEventPaths() {
  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/events/technical");
  revalidatePath("/events/non-technical");
  revalidatePath("/events/special");
  revalidatePath("/workshops");
}

async function archiveEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  if (!eventId) return;

  await archiveEventById(prisma, eventId);

  revalidateEventPaths();
  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/adminDashboard");

  await logAdminAudit({
    action: "EVENT_ARCHIVE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
  });

  const year = (formData.get("year") as string | null)?.trim();
  const selectedYear = year || String(getActiveYear());
  redirect(`/admin/events?year=${encodeURIComponent(selectedYear)}&formReset=${Date.now()}`);
}

async function restoreEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  if (!eventId) return;

  await restoreEventById(prisma, eventId);

  revalidateEventPaths();
  revalidatePath("/admin/event-registrations");
  revalidatePath("/admin/adminDashboard");

  await logAdminAudit({
    action: "EVENT_RESTORE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
  });

  const year = (formData.get("year") as string | null)?.trim();
  const selectedYear = year || String(getActiveYear());
  redirect(`/admin/events?year=${encodeURIComponent(selectedYear)}&showArchived=true&formReset=${Date.now()}`);
}

async function updateEventAction(formData: FormData) {
  'use server'
  const admin = await assertAdmin();

  const eventId = (formData.get("eventId") as string | null)?.trim();
  const yearRaw = (formData.get("year") as string | null)?.trim();
  const name = (formData.get("name") as string | null)?.trim();
  const typeRaw = (formData.get("type") as string | null)?.trim();
  const dayLabelRaw = (formData.get("dayLabel") as string | null)?.trim();
  const dateRaw = (formData.get("date") as string | null)?.trim();
  const endDateRaw = (formData.get("endDate") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const rulesUrl = (formData.get("rulesUrl") as string | null)?.trim() || null;
  const coordinatorDetails = parseCoordinators(formData);
  const participationModeRaw = (formData.get("participationMode") as string | null)?.trim();
  const isActiveRaw = formData.get("isActive") as string | null;
  const isAllDayRaw = formData.get("isAllDay") as string | null;

  if (!eventId || !name) return;
  if (!coordinatorDetails) return;

  const type = typeRaw ? typeRaw.toUpperCase() : null;
  const dayLabel = dayLabelRaw ? dayLabelRaw.toUpperCase() : null;
  const participationMode = participationModeRaw === "TEAM"
    ? EventParticipationMode.TEAM
    : EventParticipationMode.INDIVIDUAL;
  const maxParticipants = toOptionalNumber(formData.get("maxParticipants"));
  const maxTeams = toOptionalNumber(formData.get("maxTeams"));
  const teamMinSize = toOptionalNumber(formData.get("teamMinSize"));
  const teamMaxSize = toOptionalNumber(formData.get("teamMaxSize"));
  const date = dateRaw ? new Date(dateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const isActive = isActiveRaw === "on";
  const isAllDay = isAllDayRaw === "on";
  const year = Number(yearRaw);

  if ((date && Number.isNaN(date.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) return;
  if (date && endDate && endDate < date) return;
  if (!Number.isInteger(year) || year < 2000 || year > 3000) return;

  if (maxParticipants != null && maxParticipants < 1) return;
  if (maxTeams != null && maxTeams < 1) return;

  if (participationMode === "TEAM") {
    if (teamMinSize != null && teamMinSize < 1) return;
    if (teamMaxSize != null && teamMaxSize < 1) return;
    if (teamMinSize != null && teamMaxSize != null && teamMinSize > teamMaxSize) return;
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      name,
      year,
      type,
      dayLabel,
      date,
      endDate,
      description,
      rulesUrl,
      coordinatorName: coordinatorDetails.coordinatorName,
      coordinatorPhone: coordinatorDetails.coordinatorPhone,
      trainerName: null,
      contactName: null,
      contactPhone: null,
      participationMode,
      isAllDay,
      teamMinSize: participationMode === "TEAM" ? teamMinSize : null,
      teamMaxSize: participationMode === "TEAM" ? teamMaxSize : null,
      maxTeams,
      maxParticipants,
      isActive,
    },
  });

  revalidateEventPaths();

  await logAdminAudit({
    action: "EVENT_UPDATE",
    actorId: admin.id,
    actorEmail: admin.email,
    target: eventId,
    status: "SUCCESS",
    details: {
      name,
      participationMode,
      maxParticipants,
      maxTeams,
      isActive,
    },
  });

  redirect(`/admin/events?year=${encodeURIComponent(String(year))}`);
}

async function createEventAction(formData: FormData) {
  'use server'
  const user = await assertAdmin();

  const name = (formData.get("name") as string | null)?.trim();
  const yearRaw = (formData.get("year") as string | null)?.trim();
  const typeRaw = (formData.get("type") as string | null)?.trim();
  const dayLabelRaw = (formData.get("dayLabel") as string | null)?.trim();
  const type = typeRaw ? typeRaw.toUpperCase() : null;
  const dayLabel = dayLabelRaw ? dayLabelRaw.toUpperCase() : null;
  const dateRaw = (formData.get("date") as string | null)?.trim();
  const endDateRaw = (formData.get("endDate") as string | null)?.trim();
  const description = (formData.get("description") as string | null)?.trim() || null;
  const rulesUrl = (formData.get("rulesUrl") as string | null)?.trim() || null;
  const coordinatorDetails = parseCoordinators(formData);
  const participationModeRaw = (formData.get("participationMode") as string | null)?.trim();
  const participationMode = participationModeRaw === "TEAM"
    ? EventParticipationMode.TEAM
    : EventParticipationMode.INDIVIDUAL;
  const maxParticipantsRaw = (formData.get("maxParticipants") as string | null)?.trim();
  const maxTeamsRaw = (formData.get("maxTeams") as string | null)?.trim();
  const teamMinSizeRaw = (formData.get("teamMinSize") as string | null)?.trim();
  const teamMaxSizeRaw = (formData.get("teamMaxSize") as string | null)?.trim();
  const isActiveRaw = formData.get("isActive") as string | null;
  const isAllDayRaw = formData.get("isAllDay") as string | null;
  const date = dateRaw ? new Date(dateRaw) : null;
  const maxParticipants = maxParticipantsRaw ? Number(maxParticipantsRaw) : null;
  const maxTeams = maxTeamsRaw ? Number(maxTeamsRaw) : null;
  const teamMinSize = teamMinSizeRaw ? Number(teamMinSizeRaw) : null;
  const teamMaxSize = teamMaxSizeRaw ? Number(teamMaxSizeRaw) : null;
  const isActive = isActiveRaw === "on";
  const isAllDay = isAllDayRaw === "on";
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const year = Number(yearRaw);

  if (!name) {
    return;
  }

  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    return;
  }

  if ((date && Number.isNaN(date.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
    return;
  }

  if (date && endDate && endDate < date) {
    return;
  }

  if (!coordinatorDetails) {
    return;
  }

  if (maxParticipants != null && (!Number.isFinite(maxParticipants) || maxParticipants < 1)) {
    return;
  }

  if (maxTeams != null && (!Number.isFinite(maxTeams) || maxTeams < 1)) {
    return;
  }

  if (participationMode === "TEAM") {
    if (teamMinSize != null && (!Number.isFinite(teamMinSize) || teamMinSize < 1)) {
      return;
    }
    if (teamMaxSize != null && (!Number.isFinite(teamMaxSize) || teamMaxSize < 1)) {
      return;
    }
    if (teamMinSize != null && teamMaxSize != null && teamMinSize > teamMaxSize) {
      return;
    }
  }

  const existingEvent = await prisma.event.findFirst({
    where: {
      name,
      year,
    },
    select: { id: true },
  });

  const eventData = {
    year,
    type,
    dayLabel,
    date,
    endDate,
    description,
    rulesUrl,
    coordinatorName: coordinatorDetails.coordinatorName,
    coordinatorPhone: coordinatorDetails.coordinatorPhone,
    trainerName: null,
    contactName: null,
    contactPhone: null,
    participationMode,
    isAllDay,
    teamMinSize: participationMode === "TEAM" ? teamMinSize : null,
    teamMaxSize: participationMode === "TEAM" ? teamMaxSize : null,
    maxTeams,
    maxParticipants,
    isActive,
    isArchived: false,
    isTemplate: false,
    templateSourceId: null,
  };

  if (existingEvent) {
    await prisma.event.update({
      where: { id: existingEvent.id },
      data: eventData,
    });
  } else {
    await prisma.event.create({
      data: {
        name,
        ...eventData,
      },
    });
  }

  revalidatePath("/admin/events");
  revalidatePath("/events");
  revalidatePath("/events/technical");
  revalidatePath("/events/non-technical");
  revalidatePath("/events/special");
  revalidatePath("/workshops");

  await logAdminAudit({
    action: "EVENT_CREATE_OR_UPDATE",
    actorId: user.id,
    actorEmail: user.email,
    target: name,
    status: "SUCCESS",
    details: {
      participationMode,
      maxParticipants,
      maxTeams,
      isActive,
    },
  });

  redirect(`/admin/events?year=${encodeURIComponent(String(year))}&formReset=${Date.now()}`);
}

export default async function AdminEventsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") redirect("/login");

  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const editId = typeof searchParams?.edit === "string" ? searchParams.edit.trim() : "";
  const formReset = typeof searchParams?.formReset === "string" ? searchParams.formReset : "base";
  const activeYear = getActiveYear();
  const yearParam = typeof searchParams?.year === "string" ? Number(searchParams.year) : activeYear;
  const selectedYear = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 3000 ? yearParam : activeYear;
  const showArchived = typeof searchParams?.showArchived === "string" && searchParams.showArchived === "true";

  const where: Prisma.EventWhereInput = { year: selectedYear };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (!showArchived) where.isArchived = false;

  const events = await prisma.event.findMany({
    where,
    include: {
      _count: { select: { registrations: true } },
      registrations: {
        select: {
          teamId: true,
          teamSize: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { name: "asc" }],
  });

  const editingEvent = editId ? events.find((event) => event.id === editId) || null : null;

  const totalEvents = events.length;
  const workshopCount = events.filter((e) => (e.type || "").toLowerCase().includes("workshop") || e.name.toLowerCase().includes("workshop")).length;
  const upcomingCount = events.filter((e) => e.date && e.date > new Date()).length;
  const [editingCoordinatorName1, editingCoordinatorName2, editingCoordinatorName3] = splitCoordinatorField(editingEvent?.coordinatorName);
  const [editingCoordinatorPhone1, editingCoordinatorPhone2, editingCoordinatorPhone3] = splitCoordinatorField(editingEvent?.coordinatorPhone);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <LiveSyncRefresher intervalMs={12000} />
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Event Management</h1>
          <p className="text-gray-600">Manage events and workshops.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Events</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{totalEvents}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Workshops</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{workshopCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase">Upcoming</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{upcomingCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-gray-900">CSV Export</h2>
            <p className="text-sm text-gray-600">Download all events for backup or bulk editing.</p>
            <a
              href="/api/admin/csv/events/export"
              className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download Events CSV
            </a>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
            <h2 className="text-lg font-bold text-gray-900">CSV Import</h2>
            <p className="text-sm text-gray-600">Upload events CSV (same headers as export) to upsert records.</p>
            <form action="/api/admin/csv/events/import" method="post" encType="multipart/form-data" className="flex flex-col sm:flex-row gap-2 sm:items-center">
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

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <form className="flex flex-col md:flex-row gap-3 md:items-center" method="get">
            <input
              type="number"
              min={2000}
              max={3000}
              name="year"
              defaultValue={selectedYear}
              className="w-full md:w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search events"
              className="w-full md:flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="showArchived" value="true" defaultChecked={showArchived} />
              Show archived
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800"
            >
              Apply
            </button>
          </form>
          <p className="mt-3 text-xs text-gray-500">
            Archive is reversible and non-destructive. It keeps registrations and logs intact.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3">Teams</th>
                  <th className="px-4 py-3">Registrations</th>
                  <th className="px-4 py-3">Occupancy</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => {
                  const participantCount = event.registrations.reduce(
                    (sum, registration) => sum + (registration.teamId ? 1 : registration.teamSize || 1),
                    0
                  );
                  const teamCount = event._count.registrations;
                  const participantRatio = event.maxParticipants
                    ? Math.min((participantCount / event.maxParticipants) * 100, 100)
                    : 0;
                  const teamRatio = event.maxTeams
                    ? Math.min((teamCount / event.maxTeams) * 100, 100)
                    : 0;

                  return (
                    <tr key={event.id} className="hover:bg-gray-50 align-top">
                      <td className="px-4 py-3 font-semibold text-gray-900">{event.name}</td>
                      <td className="px-4 py-3 text-gray-700">{event.type || "--"}</td>
                      <td className="px-4 py-3 text-gray-700">{event.participationMode}</td>
                      <td className="px-4 py-3 text-gray-700">{event.dayLabel || "--"}</td>
                      <td className="px-4 py-3 text-gray-700">{event.isAllDay ? "All Day" : formatDateRange(event.date, event.endDate)}</td>
                      <td className="px-4 py-3 text-gray-700">{event.maxParticipants ?? "Unlimited"}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {event.maxTeams ?? "Unlimited"}
                        {event.participationMode === "TEAM" && (event.teamMinSize || event.teamMaxSize)
                          ? ` (${event.teamMinSize ?? "?"}-${event.teamMaxSize ?? "?"})`
                          : ""}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-semibold">{teamCount}</td>
                      <td className="px-4 py-3 min-w-[240px]">
                        <div className="space-y-2 text-xs text-gray-700">
                          <div>
                            <div className="flex justify-between">
                              <span>Participants</span>
                              <span>{participantCount}/{event.maxParticipants ?? "∞"}</span>
                            </div>
                            {event.maxParticipants != null && (
                              <div className="mt-1 h-1.5 w-full rounded bg-gray-200">
                                <div className="h-1.5 rounded bg-gray-700" style={{ width: `${participantRatio}%` }} />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex justify-between">
                              <span>Teams</span>
                              <span>{teamCount}/{event.maxTeams ?? "∞"}</span>
                            </div>
                            {event.maxTeams != null && (
                              <div className="mt-1 h-1.5 w-full rounded bg-gray-200">
                                <div className="h-1.5 rounded bg-gray-700" style={{ width: `${teamRatio}%` }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {event.isArchived ? "Archived" : event.isActive ? "Active" : "Inactive"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/admin/events?year=${selectedYear}&edit=${event.id}${q ? `&q=${encodeURIComponent(q)}` : ""}${showArchived ? "&showArchived=true" : ""}`}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            Edit
                          </a>
                          {event.isArchived ? (
                            <form action={restoreEventAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="year" value={selectedYear} />
                              <button
                                type="submit"
                                className="rounded border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                              >
                                Restore
                              </button>
                            </form>
                          ) : (
                            <form action={archiveEventAction}>
                              <input type="hidden" name="eventId" value={event.id} />
                              <input type="hidden" name="year" value={selectedYear} />
                              <button
                                type="submit"
                                className="rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                              >
                                Archive
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {events.length === 0 && (
                  <tr>
                    <td colSpan={11} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No events found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {editingEvent && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit Event</h2>
              <a href="/admin/events" className="text-sm font-semibold text-gray-600 hover:text-gray-900">Clear</a>
            </div>
            <form action={updateEventAction} className="space-y-3">
              <input type="hidden" name="eventId" value={editingEvent.id} />
              <input type="hidden" name="year" value={editingEvent.year} />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Event Name*
                  <input name="name" required defaultValue={editingEvent.name} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Type
                  <select
                    name="type"
                    defaultValue={editingEvent.type || ""}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select type</option>
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Participation Mode
                  <select name="participationMode" defaultValue={editingEvent.participationMode} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                    <option value="TEAM">TEAM</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                  <input type="checkbox" name="isAllDay" defaultChecked={editingEvent.isAllDay} /> All Day Event
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Day Label
                  <select
                    name="dayLabel"
                    defaultValue={editingEvent.dayLabel || ""}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="">Select day</option>
                    {DAY_LABEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Date & Time
                  <input type="datetime-local" name="date" defaultValue={toDateTimeLocalValue(editingEvent.date)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  End Date & Time
                  <input type="datetime-local" name="endDate" defaultValue={toDateTimeLocalValue(editingEvent.endDate)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Max Participants
                  <input type="number" min={1} name="maxParticipants" defaultValue={editingEvent.maxParticipants ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Max Teams
                  <input type="number" min={1} name="maxTeams" defaultValue={editingEvent.maxTeams ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Team Min Size
                  <input type="number" min={1} name="teamMinSize" defaultValue={editingEvent.teamMinSize ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Team Max Size
                  <input type="number" min={1} name="teamMaxSize" defaultValue={editingEvent.teamMaxSize ?? ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                  <input type="checkbox" name="isActive" defaultChecked={editingEvent.isActive} /> Active
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Description
                  <textarea name="description" rows={3} defaultValue={editingEvent.description || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Rules URL
                    <input name="rulesUrl" defaultValue={editingEvent.rulesUrl || ""} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 1 Name*
                    <input name="coordinatorName1" required defaultValue={editingCoordinatorName1} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 1 Phone*
                    <input name="coordinatorPhone1" required defaultValue={editingCoordinatorPhone1} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 2 Name
                    <input name="coordinatorName2" defaultValue={editingCoordinatorName2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 2 Phone
                    <input name="coordinatorPhone2" defaultValue={editingCoordinatorPhone2} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 3 Name
                    <input name="coordinatorName3" defaultValue={editingCoordinatorName3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm text-gray-700">
                    Coordinator 3 Phone
                    <input name="coordinatorPhone3" defaultValue={editingCoordinatorPhone3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800">Update Event</button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Create Event</h2>
          <form key={formReset} action={createEventAction} className="space-y-3" autoComplete="off">
            <input type="hidden" name="year" value={selectedYear} />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Event Name*
                <input name="name" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Type
                <select
                  name="type"
                  defaultValue=""
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select type</option>
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Participation Mode
                <select name="participationMode" defaultValue="INDIVIDUAL" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="INDIVIDUAL">INDIVIDUAL</option>
                  <option value="TEAM">TEAM</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                <input type="checkbox" name="isAllDay" /> All Day Event
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Day Label
                <select
                  name="dayLabel"
                  defaultValue=""
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <option value="">Select day</option>
                  {DAY_LABEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Date & Time
                <input type="datetime-local" name="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                End Date & Time
                <input type="datetime-local" name="endDate" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Max Participants
                <input type="number" min={1} name="maxParticipants" placeholder="Leave empty for unlimited" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Max Teams
                <input type="number" min={1} name="maxTeams" placeholder="Team events only" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Team Min Size
                <input type="number" min={1} name="teamMinSize" placeholder="e.g. 2" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Team Max Size
                <input type="number" min={1} name="teamMaxSize" placeholder="e.g. 4" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-7">
                <input type="checkbox" name="isActive" defaultChecked /> Active
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Description
                <textarea name="description" rows={3} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Rules URL
                  <input name="rulesUrl" placeholder="https://..." className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 1 Name*
                  <input name="coordinatorName1" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 1 Phone*
                  <input name="coordinatorPhone1" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 2 Name
                  <input name="coordinatorName2" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 2 Phone
                  <input name="coordinatorPhone2" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 3 Name
                  <input name="coordinatorName3" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
                <label className="flex flex-col gap-1 text-sm text-gray-700">
                  Coordinator 3 Phone
                  <input name="coordinatorPhone3" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </label>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
