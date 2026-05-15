'use server'

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { type Prisma } from "@prisma/client";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import { getActiveYear } from "@/lib/edition";
import { EventHeaderActions } from "./_components/EventHeaderActions";
import { EventFilters } from "./_components/EventFilters";
import { EventsTable } from "./_components/EventsTable";
import { EventModals } from "./_components/EventModals";

export default async function AdminEventsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") redirect("/login");

  const resolvedSearchParams = (await searchParams) ?? {};

  const q = typeof resolvedSearchParams.q === "string" ? resolvedSearchParams.q.trim() : "";
  const editId = typeof resolvedSearchParams.edit === "string" ? resolvedSearchParams.edit.trim() : "";
  const formReset = typeof resolvedSearchParams.formReset === "string" ? resolvedSearchParams.formReset : "base";
  const activeYear = getActiveYear();
  const yearParam = typeof resolvedSearchParams.year === "string" ? Number(resolvedSearchParams.year) : activeYear;
  const selectedYear = Number.isInteger(yearParam) && yearParam >= 2000 && yearParam <= 3000 ? yearParam : activeYear;
  const showArchived = typeof resolvedSearchParams.showArchived === "string" && resolvedSearchParams.showArchived === "true";
  const createType = typeof resolvedSearchParams.create === "string" ? resolvedSearchParams.create.toUpperCase() : null;

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
  const workshopCount = events.filter((e) => e.category === "WORKSHOP" || (e.type || "").toLowerCase().includes("workshop") || e.name.toLowerCase().includes("workshop")).length;
  const upcomingCount = events.filter((e) => e.date && e.date > new Date()).length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <LiveSyncRefresher intervalMs={12000} />
      <div className="max-w-6xl mx-auto space-y-8">
        <EventHeaderActions
          selectedYear={selectedYear}
          totalEvents={totalEvents}
          workshopCount={workshopCount}
          upcomingCount={upcomingCount}
        />

        <EventFilters
          selectedYear={selectedYear}
          q={q}
          showArchived={showArchived}
        />

        <EventsTable 
          events={events}
          selectedYear={selectedYear}
          q={q}
          showArchived={showArchived}
        />

        <EventModals 
          editingEvent={editingEvent}
          createType={createType}
          selectedYear={selectedYear}
          q={q}
          showArchived={showArchived}
          formReset={formReset}
        />
      </div>
    </div>
  );
}
