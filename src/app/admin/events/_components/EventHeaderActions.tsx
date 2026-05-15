import React from 'react';

interface EventHeaderActionsProps {
  selectedYear: number;
  totalEvents: number;
  workshopCount: number;
  upcomingCount: number;
}

export function EventHeaderActions({
  selectedYear,
  totalEvents,
  workshopCount,
  upcomingCount,
}: EventHeaderActionsProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-gray-900">Event Management</h1>
          <p className="text-gray-600 text-sm">Create and manage your symposium events and workshops.</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/admin/events?year=${selectedYear}&create=EVENT`}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-gray-800 hover:scale-[1.02] active:scale-[0.98]"
          >
            Add New Event
          </a>
          <a
            href={`/admin/events?year=${selectedYear}&create=WORKSHOP`}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-5 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50 hover:scale-[1.02] active:scale-[0.98]"
          >
            Add New Workshop
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Total Events</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalEvents}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Workshops</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{workshopCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase">Upcoming</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{upcomingCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
          <h2 className="text-lg font-bold text-gray-900">CSV Export</h2>
          <p className="text-sm text-gray-600">Download all events for backup or bulk editing.</p>
          <a
            href="/api/admin/csv/events/export"
            className="inline-flex rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Download Events CSV
          </a>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-3">
          <h2 className="text-lg font-bold text-gray-900">CSV Import</h2>
          <p className="text-sm text-gray-600">Upload events CSV with date, time, all-day, team-size, team-capacity, and participant-limit fields to upsert records.</p>
          <div className="flex items-center gap-3">
            <a
              href="/api/admin/csv/events/template"
              className="inline-flex rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download CSV Template
            </a>
            <span className="text-xs text-gray-500">Template with headers and a sample row</span>
          </div>
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
    </>
  );
}
