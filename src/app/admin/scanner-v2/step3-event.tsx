'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useScannerContext, EventMetadata } from './ScannerContext';
import { filterEventsByFunction } from './scanner-steps-lib';
import { getAvailableEvents } from '@/server/actions/event-logistics';

export function Step3Event() {
  const { participant, selectedFunction, selectedEvent, setSelectedEvent } = useScannerContext();
  const [allEvents, setAllEvents] = useState<EventMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true);
        setError('');
        const events = await getAvailableEvents();

        if (!Array.isArray(events)) {
          setAllEvents([]);
          return;
        }

        const normalized: EventMetadata[] = events
          .filter((e) => {
            return (
              typeof e === 'object' &&
              e !== null &&
              typeof e.name === 'string' &&
              typeof e.participationMode === 'string'
            );
          })
          .map((e) => ({
            name: e.name,
            type: e.type ?? null,
            participationMode: e.participationMode,
            teamMinSize: e.teamMinSize ?? null,
            teamMaxSize: e.teamMaxSize ?? null,
          }));

        setAllEvents(normalized);
      } catch (err) {
        setError('Failed to load events');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    return filterEventsByFunction(allEvents, selectedFunction, participant);
  }, [allEvents, selectedFunction, participant]);

  if (!participant || !selectedFunction) {
    return (
      <div className="text-center p-8 text-gray-500">
        <p>Please complete previous steps first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center p-8">
        <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin text-blue-600" />
        <p className="text-sm text-gray-600">Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Error</p>
          <p className="text-xs text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (filteredEvents.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 3: Select Event</h2>
          <p className="text-sm text-blue-700">No events available for this action</p>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
          <p className="text-sm text-amber-700">No matching events found. Try a different action.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">Step 3: Select Event/Station</h2>
        <p className="text-sm text-blue-700">Choose from available events for this action</p>
      </div>

      <div className="space-y-2">
        {filteredEvents.map((event) => {
          const isSelected = selectedEvent?.name === event.name;

          return (
            <button
              key={event.name}
              onClick={() => setSelectedEvent(event)}
              className={`w-full p-4 border-2 rounded-lg transition text-left ${
                isSelected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-400'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className={`font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                    {event.name}
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Mode: <span className="font-mono">{event.participationMode}</span>
                  </p>
                  {event.participationMode === 'TEAM' && event.teamMinSize && event.teamMaxSize && (
                    <p className="text-xs text-gray-600 mt-1">
                      Team size: {event.teamMinSize} – {event.teamMaxSize} members
                    </p>
                  )}
                </div>
                {isSelected && <div className="text-blue-600 font-bold text-lg">✓</div>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedEvent && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            ✓ <strong>{selectedEvent.name}</strong> selected. Proceeding to next step.
          </p>
        </div>
      )}
    </div>
  );
}
