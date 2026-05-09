import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { getActiveYear } from "@/lib/edition";
import { ScoringSetup } from "@/components/features/ScoringSetup";

export default async function AdminMarkingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const resolvedParams = (await searchParams) ?? {};
  const eventId =
    typeof resolvedParams.eventId === "string" ? resolvedParams.eventId : null;

  const activeYear = getActiveYear();
  const events = await prisma.event.findMany({
    where: {
      year: activeYear,
      isArchived: false,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      date: true,
      participationMode: true,
    },
    orderBy: [{ date: "asc" }, { name: "asc" }],
  });

  const selectedEvent = eventId ? events.find((e) => e.id === eventId) : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 md:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            Marking & Scoring
          </h1>
          <p className="text-gray-600 mt-2 text-sm sm:text-base">
            Configure criteria and review live marks for SHACKLES {activeYear} events.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-violet-500">
            <p className="text-gray-600 text-sm uppercase tracking-wide font-semibold">
              Active Events
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{events.length}</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-lime-500">
            <p className="text-gray-600 text-sm uppercase tracking-wide font-semibold">
              Live Dashboard
            </p>
            <Link
              href="/admin/liveDashboard"
              className="inline-flex mt-3 text-sm font-semibold text-lime-700 hover:text-lime-800"
            >
              Open Live Dashboard
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
            <p className="text-gray-600 text-sm uppercase tracking-wide font-semibold">
              Event Manager
            </p>
            <Link
              href="/admin/events"
              className="inline-flex mt-3 text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              Open Event Management
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Event Marking Shortcuts</h2>
            <Link
              href="/admin/events"
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              Manage All Events
            </Link>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-gray-600">
              No active events found for the current year.
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{event.name}</p>
                    <p className="text-sm text-gray-600">
                      {(event.type || "GENERAL").toUpperCase()} |{" "}
                      {event.participationMode}
                      {event.date
                        ? ` | ${new Date(event.date).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/marking?eventId=${event.id}`}
                      className="px-3 py-2 rounded-md bg-violet-100 text-violet-800 text-sm font-semibold hover:bg-violet-200"
                    >
                      Scoring Setup
                    </Link>
                    <Link
                      href={`/admin/liveDashboard?eventId=${event.id}`}
                      className="px-3 py-2 rounded-md bg-lime-100 text-lime-800 text-sm font-semibold hover:bg-lime-200"
                    >
                      Live Leaderboard
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedEvent && (
          <div className="bg-white rounded-lg shadow-md p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                Scoring Setup — {selectedEvent.name}
              </h2>
              <Link
                href="/admin/marking"
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                ✕ Close
              </Link>
            </div>
            <ScoringSetup
              eventId={selectedEvent.id}
              eventName={selectedEvent.name}
            />
          </div>
        )}
      </div>
    </div>
  );
}