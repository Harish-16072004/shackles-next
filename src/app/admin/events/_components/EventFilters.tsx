import React from 'react';

interface EventFiltersProps {
  selectedYear: number;
  q: string;
  showArchived: boolean;
}

export function EventFilters({ selectedYear, q, showArchived }: EventFiltersProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
      <form className="flex flex-col md:flex-row gap-3 md:items-center" method="get">
        <input
          type="number"
          min={2000}
          max={3000}
          name="year"
          defaultValue={selectedYear}
          className="w-full md:w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
        />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search events"
          className="w-full md:flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-gray-900"
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
  );
}
