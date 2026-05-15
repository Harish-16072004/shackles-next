import React from 'react';
import { Prisma } from '@prisma/client';
import { archiveEventAction, restoreEventAction } from '../actions';

type EventWithRegistrations = Prisma.EventGetPayload<{
  include: {
    _count: { select: { registrations: true } };
    registrations: {
      select: {
        teamId: true;
        teamSize: true;
      };
    };
  };
}>;

interface EventsTableProps {
  events: EventWithRegistrations[];
  selectedYear: number;
  q: string;
  showArchived: boolean;
}

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

export function EventsTable({ events, selectedYear, q, showArchived }: EventsTableProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
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
                  <td className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">{event.category || "EVENT"}</td>
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
                          <div className="mt-1 h-1.5 w-full rounded-sm bg-gray-200">
                            <div className="h-1.5 rounded-sm bg-gray-700" style={{ width: `${participantRatio}%` }} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex justify-between">
                          <span>Teams</span>
                          <span>{teamCount}/{event.maxTeams ?? "∞"}</span>
                        </div>
                        {event.maxTeams != null && (
                          <div className="mt-1 h-1.5 w-full rounded-sm bg-gray-200">
                            <div className="h-1.5 rounded-sm bg-gray-700" style={{ width: `${teamRatio}%` }} />
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
                        className="rounded-sm border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Edit
                      </a>
                      {event.isArchived ? (
                        <form action={restoreEventAction}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <input type="hidden" name="year" value={selectedYear} />
                          <button
                            type="submit"
                            className="rounded-sm border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
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
                            className="rounded-sm border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
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
                <td colSpan={12} className="px-6 py-10 text-center text-gray-500 text-sm">
                  No events found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
