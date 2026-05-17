import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSession, requireEventStaff } from "@/lib/session";
import { getActiveYear } from "@/lib/edition";
import { ScoringSetup } from "@/components/features/ScoringSetup";
import { LeaderboardView } from "@/components/features/LeaderboardView";

export default async function AdminMarkingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const isAdmin = session.role === "ADMIN";

  const resolvedParams = (await searchParams) ?? {};
  const scoringEventId =
    typeof resolvedParams.scoring === "string" ? resolvedParams.scoring : null;
  const leaderboardEventId =
    typeof resolvedParams.leaderboard === "string" ? resolvedParams.leaderboard : null;
  // Keep legacy support
  const legacyEventId =
    typeof resolvedParams.eventId === "string" ? resolvedParams.eventId : null;

  const activeEventId = scoringEventId || legacyEventId;

  if (!isAdmin) {
    if (!activeEventId) {
      return (
        <div className="p-8 text-center text-red-600">
          <p>Please select an event from your dashboard to mark.</p>
          <Link href="/staff/coordinatorDashboard" className="mt-4 inline-block text-blue-600 underline">
            Return to Dashboard
          </Link>
        </div>
      );
    }
    await requireEventStaff(activeEventId, "MANAGE_SCORES");
  }

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

  const selectedScoringEvent = activeEventId ? events.find((e) => e.id === activeEventId) : null;
  const selectedLeaderboardEvent = leaderboardEventId ? events.find((e) => e.id === leaderboardEventId) : null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 md:mb-10">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            Marking & Scoring
          </h1>
          <p className="text-gray-600 mt-2 text-sm sm:text-base">
            {isAdmin ? `Configure criteria and review live marks for SHACKLES ${activeYear} events.` : `Allocate marks for ${selectedScoringEvent?.name}.`}
          </p>
        </div>

        {isAdmin && (
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
        )}

        {isAdmin && (
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
                        href={`/admin/marking?scoring=${event.id}`}
                        className="px-3 py-2 rounded-md bg-violet-100 text-violet-800 text-sm font-semibold hover:bg-violet-200 transition-colors"
                      >
                        Scoring Setup
                      </Link>
                      <Link
                        href={`/admin/marking?leaderboard=${event.id}`}
                        className="px-3 py-2 rounded-md bg-lime-100 text-lime-800 text-sm font-semibold hover:bg-lime-200 transition-colors"
                      >
                        Live Leaderboard
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Scoring Setup Modal ──────────────────────────────────────────── */}
        {selectedScoringEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-3xl my-auto bg-white border-2 border-gray-900 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Scoring Setup — {selectedScoringEvent.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Configure marking criteria and scoring components
                  </p>
                </div>
                <Link
                  href="/admin/marking"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  ✕
                </Link>
              </div>
              <ScoringSetup
                eventId={selectedScoringEvent.id}
                eventName={selectedScoringEvent.name}
              />
            </div>
          </div>
        )}

        {/* ─── Live Leaderboard Modal ──────────────────────────────────────── */}
        {selectedLeaderboardEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-5xl my-auto bg-white border-2 border-gray-900 rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    Live Leaderboard — {selectedLeaderboardEvent.name}
                  </h2>
                  <p className="text-sm text-gray-500">
                    Real-time aggregated marks and ranking
                  </p>
                </div>
                <Link
                  href="/admin/marking"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  ✕
                </Link>
              </div>
              <LeaderboardView eventId={selectedLeaderboardEvent.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}