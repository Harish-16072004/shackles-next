'use server'

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Prisma } from "@prisma/client";

function formatDate(date?: Date | null) {
  if (!date) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

async function createEventAction(formData: FormData) {
  'use server'
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || user.role !== "ADMIN") redirect("/login");

  const name = (formData.get("name") as string | null)?.trim();
  const typeRaw = (formData.get("type") as string | null)?.trim();
  const dayLabelRaw = (formData.get("dayLabel") as string | null)?.trim();
  const type = typeRaw ? typeRaw.toUpperCase() : null;
  const dayLabel = dayLabelRaw ? dayLabelRaw.toUpperCase() : null;
  const dateRaw = (formData.get("date") as string | null)?.trim();
  const maxParticipantsRaw = (formData.get("maxParticipants") as string | null)?.trim();
  const isActiveRaw = formData.get("isActive") as string | null;
  const date = dateRaw ? new Date(dateRaw) : null;
  const maxParticipants = maxParticipantsRaw ? Number(maxParticipantsRaw) : null;
  const isActive = isActiveRaw === "on";

  if (!name) {
    return;
  }

  if (maxParticipants != null && (!Number.isFinite(maxParticipants) || maxParticipants < 1)) {
    return;
  }

  if (dayLabel && type) {
    const config = await prisma.eventDayConfig.findUnique({
      where: {
        dayLabel_category: {
          dayLabel,
          category: type,
        },
      },
    });

    if (config && config.maxEvents > 0) {
      const existing = await prisma.event.findUnique({ where: { name } });
      const alreadyAssigned =
        existing &&
        existing.dayLabel === dayLabel &&
        (existing.type || "") === type;

      if (!alreadyAssigned) {
        const assignedCount = await prisma.event.count({
          where: {
            dayLabel,
            type,
            isActive: true,
          },
        });

        if (assignedCount >= config.maxEvents) {
          return;
        }
      }
    }
  }

  await prisma.event.upsert({
    where: { name },
    update: { type, dayLabel, date, maxParticipants, isActive },
    create: { name, type, dayLabel, date, maxParticipants, isActive },
  });

  revalidatePath("/admin/events");
}

async function saveDayConfigAction(formData: FormData) {
  'use server'
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!user || user.role !== "ADMIN") redirect("/login");

  const dayLabelRaw = (formData.get("configDayLabel") as string | null)?.trim();
  const categoryRaw = (formData.get("configCategory") as string | null)?.trim();
  const dayLabel = dayLabelRaw?.toUpperCase();
  const category = categoryRaw?.toUpperCase();
  const maxEventsRaw = (formData.get("configMaxEvents") as string | null)?.trim();
  const maxEvents = maxEventsRaw ? Number(maxEventsRaw) : NaN;

  if (!dayLabel || !category || !Number.isFinite(maxEvents) || maxEvents < 0) {
    return;
  }

  await prisma.eventDayConfig.upsert({
    where: {
      dayLabel_category: {
        dayLabel,
        category,
      },
    },
    update: {
      maxEvents,
    },
    create: {
      dayLabel,
      category,
      maxEvents,
    },
  });

  revalidatePath("/admin/events");
}

export default async function AdminEventsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") redirect("/login");

  const q = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";

  const where: Prisma.EventWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };

  const events = await prisma.event.findMany({
    where,
    include: { _count: { select: { registrations: true } } },
    orderBy: [{ date: "asc" }, { name: "asc" }],
  });

  const dayConfigs = await prisma.eventDayConfig.findMany({
    orderBy: [{ dayLabel: "asc" }, { category: "asc" }],
  });

  const assignedByDayCategory = await prisma.event.groupBy({
    by: ["dayLabel", "type"],
    where: {
      isActive: true,
      dayLabel: { not: null },
      type: { not: null },
    },
    _count: {
      _all: true,
    },
  });

  const assignedLookup = new Map<string, number>();
  for (const row of assignedByDayCategory) {
    if (row.dayLabel && row.type) {
      assignedLookup.set(`${row.dayLabel}::${row.type}`, row._count._all);
    }
  }

  const totalEvents = events.length;
  const workshopCount = events.filter((e) => (e.type || "").toLowerCase().includes("workshop") || e.name.toLowerCase().includes("workshop")).length;
  const upcomingCount = events.filter((e) => e.date && e.date > new Date()).length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
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

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <form className="flex flex-col md:flex-row gap-3 md:items-center" method="get">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Search events"
              className="w-full md:flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800"
            >
              Apply
            </button>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Capacity</th>
                  <th className="px-4 py-3">Registrations</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{event.name}</td>
                    <td className="px-4 py-3 text-gray-700">{event.type || "--"}</td>
                    <td className="px-4 py-3 text-gray-700">{event.dayLabel || "--"}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(event.date)}</td>
                    <td className="px-4 py-3 text-gray-700">{event.maxParticipants ?? "Unlimited"}</td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">{event._count.registrations}</td>
                    <td className="px-4 py-3 text-gray-700">{event.isActive ? "Active" : "Inactive"}</td>
                  </tr>
                ))}

                {events.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No events found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Daily Slot Configuration</h2>
          <form action={saveDayConfigAction} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Day Label*
                <input name="configDayLabel" required placeholder="DAY1" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Category*
                <input name="configCategory" required placeholder="WORKSHOP / TECHNICAL" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Max Events*
                <input type="number" min={0} name="configMaxEvents" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800">Save Day Config</button>
            </div>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Max Events</th>
                  <th className="px-4 py-3">Assigned Active</th>
                  <th className="px-4 py-3">Slots Left</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dayConfigs.map((config) => {
                  const assigned = assignedLookup.get(`${config.dayLabel}::${config.category}`) || 0;
                  const slotsLeft = Math.max(config.maxEvents - assigned, 0);
                  return (
                    <tr key={config.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-900">{config.dayLabel}</td>
                      <td className="px-4 py-3 text-gray-700">{config.category}</td>
                      <td className="px-4 py-3 text-gray-700">{config.maxEvents}</td>
                      <td className="px-4 py-3 text-gray-700">{assigned}</td>
                      <td className="px-4 py-3 text-gray-700">{slotsLeft}</td>
                    </tr>
                  );
                })}

                {dayConfigs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-gray-500 text-sm">
                      No day configurations added.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Create Event</h2>
          <form action={createEventAction} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Event Name*
                <input name="name" required className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Type
                <input name="type" placeholder="Technical / Workshop" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Day Label
                <input name="dayLabel" placeholder="DAY1" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Date
                <input type="date" name="date" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                Max Participants
                <input type="number" min={1} name="maxParticipants" placeholder="Leave empty for unlimited" className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-6">
                <input type="checkbox" name="isActive" defaultChecked /> Active
              </label>
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
