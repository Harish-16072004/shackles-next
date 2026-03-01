"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

type EventItem = {
  id: string;
  name: string;
  type: string | null;
  dayLabel: string | null;
  date: string | null;
  description: string | null;
  rulesUrl: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  trainerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  participationMode: "INDIVIDUAL" | "TEAM";
  teamMinSize: number | null;
  teamMaxSize: number | null;
  maxTeams: number | null;
  maxParticipants: number | null;
  isActive: boolean;
  registeredTeams: number;
  registeredCount: number;
  teamsLeft: number | null;
  spotsLeft: number | null;
};

type Props = {
  category: string;
  title: string;
  subtitle: string;
  accent: "red" | "cyan" | "emerald";
};

const accentStyles = {
  red: {
    cardBorder: "hover:border-red-600/30",
    modalBorder: "border-red-900/50",
    closeButton: "border-red-600 text-red-600 hover:bg-red-600 hover:text-white",
    rules: "border-red-600 text-red-500 hover:bg-red-600/10",
    contact: "text-red-500 hover:text-red-400",
  },
  cyan: {
    cardBorder: "hover:border-cyan-600/30",
    modalBorder: "border-cyan-900/50",
    closeButton: "border-cyan-600 text-cyan-600 hover:bg-cyan-600 hover:text-white",
    rules: "border-cyan-600 text-cyan-500 hover:bg-cyan-600/10",
    contact: "text-cyan-500 hover:text-cyan-400",
  },
  emerald: {
    cardBorder: "hover:border-emerald-600/30",
    modalBorder: "border-emerald-900/50",
    closeButton: "border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white",
    rules: "border-emerald-600 text-emerald-500 hover:bg-emerald-600/10",
    contact: "text-emerald-500 hover:text-emerald-400",
  },
};

export default function EventCategoryPage({ category, title, subtitle, accent }: Props) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");
  const styles = accentStyles[accent];

  const loadEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/public-stats?category=${encodeURIComponent(category)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const body = await response.json();
      setEvents(Array.isArray(body.events) ? body.events : []);
    } catch {
      setEvents([]);
    }
  }, [category]);

  useEffect(() => {
    void loadEvents();

    let source: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

    const setupFallback = () => {
      if (!fallbackInterval) {
        fallbackInterval = setInterval(() => {
          void loadEvents();
        }, 12000);
      }
    };

    try {
      source = new EventSource("/api/live-sync");
      source.onmessage = () => {
        void loadEvents();
      };
      source.onerror = () => {
        setupFallback();
      };
    } catch {
      setupFallback();
    }

    return () => {
      if (source) {
        source.close();
      }
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [loadEvents]);

  useEffect(() => {
    if (!selectedEvent) {
      setTeamName("");
      setTeamSize("");
      return;
    }

    if (selectedEvent.participationMode !== "TEAM") {
      setTeamName("");
      setTeamSize("");
      return;
    }

    setTeamSize(selectedEvent.teamMinSize ? String(selectedEvent.teamMinSize) : "");
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    const updated = events.find((event) => event.id === selectedEvent.id);
    if (updated) {
      setSelectedEvent(updated);
    }
  }, [events, selectedEvent]);

  const activeCount = useMemo(() => events.filter((event) => event.isActive).length, [events]);

  async function handleRegister(event: EventItem) {
    let payloadTeamName: string | undefined;
    let payloadTeamSize: number | undefined;

    if (event.participationMode === "TEAM") {
      const trimmedTeamName = teamName.trim();
      const parsedTeamSize = Number(teamSize);

      if (!trimmedTeamName) {
        setFeedback("Team name is required for team events.");
        return;
      }

      if (!Number.isInteger(parsedTeamSize) || parsedTeamSize < 1) {
        setFeedback("Enter a valid team size.");
        return;
      }

      if (event.teamMinSize != null && parsedTeamSize < event.teamMinSize) {
        setFeedback(`Minimum team size is ${event.teamMinSize}.`);
        return;
      }

      if (event.teamMaxSize != null && parsedTeamSize > event.teamMaxSize) {
        setFeedback(`Maximum team size is ${event.teamMaxSize}.`);
        return;
      }

      payloadTeamName = trimmedTeamName;
      payloadTeamSize = parsedTeamSize;
    }

    try {
      setRegistering(true);
      setFeedback("");
      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: event.name,
          teamName: payloadTeamName,
          teamSize: payloadTeamSize,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(body.error || "Unable to register now.");
      } else {
        setFeedback(body.message || "Registered successfully.");
        await loadEvents();
      }
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="flex flex-col gap-12 pb-8">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold text-gray-900">{title}</h1>
        <p className="text-lg text-gray-600">{subtitle}</p>
        <p className="text-sm text-gray-500">{activeCount} active events</p>
        <Link href="/events" className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          <span>←</span>
          <span>Back to events</span>
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {events.map((event) => {
          const isClosed = !event.isActive || (event.spotsLeft != null && event.spotsLeft <= 0) || (event.teamsLeft != null && event.teamsLeft <= 0);
          return (
            <button
              key={event.id}
              onClick={() => setSelectedEvent(event)}
              className={`flex h-full flex-col gap-3 rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 ${styles.cardBorder}`}
            >
              <div className="h-4 w-4 rounded-full bg-white/50" />
              <h2 className="text-xl font-semibold text-gray-900 leading-tight">{event.name}</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{(event.description || "No description available").substring(0, 120)}...</p>
              <p className="text-xs text-gray-500 mt-auto">
                {isClosed ? "Closed" : "Open"} • Registered {event.registeredCount}
                {event.spotsLeft != null ? ` • Spots left ${event.spotsLeft}` : ""}
              </p>
            </button>
          );
        })}

        {events.length === 0 && (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No events configured by admin yet.
          </div>
        )}
      </section>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className={`relative w-full max-w-2xl rounded-2xl border-2 bg-gray-900 p-8 text-white max-h-[90vh] overflow-y-auto ${styles.modalBorder}`}>
            <button
              onClick={() => setSelectedEvent(null)}
              className={`absolute right-4 top-4 rounded border p-1 ${styles.closeButton}`}
            >
              <X size={20} />
            </button>

            <div className="mb-6 flex items-center gap-3">
              <div className="h-6 w-6 rounded-full bg-white/20" />
              <h2 className="text-2xl font-bold text-gray-100">{selectedEvent.name}</h2>
            </div>

            <p className="mb-6 text-sm leading-relaxed text-gray-300">{selectedEvent.description || "No description available."}</p>

            <p className="mb-4 text-xs text-gray-300">
              Participants: {selectedEvent.registeredCount}
              {selectedEvent.spotsLeft != null ? ` • Spots left: ${selectedEvent.spotsLeft}` : ""}
              {selectedEvent.maxTeams != null ? ` • Teams left: ${selectedEvent.teamsLeft ?? 0}` : ""}
            </p>

            {selectedEvent.participationMode === "TEAM" && (
              <div className="mb-6 rounded border border-gray-700 bg-gray-800/40 p-4">
                <p className="mb-3 text-sm font-semibold text-gray-100">Team Registration</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                    placeholder="Team name"
                    className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                  />
                  <input
                    value={teamSize}
                    onChange={(event) => setTeamSize(event.target.value)}
                    type="number"
                    min={selectedEvent.teamMinSize ?? 1}
                    max={selectedEvent.teamMaxSize ?? undefined}
                    placeholder="Team size"
                    className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                  />
                </div>
                {(selectedEvent.teamMinSize != null || selectedEvent.teamMaxSize != null) && (
                  <p className="mt-2 text-xs text-gray-400">
                    Team size allowed: {selectedEvent.teamMinSize ?? 1} - {selectedEvent.teamMaxSize ?? "∞"}
                  </p>
                )}
              </div>
            )}

            <div className="mb-6 flex flex-col gap-4 border-t border-gray-700 pt-6">
              {selectedEvent.rulesUrl && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Rules & Regulations</h3>
                  <a
                    href={selectedEvent.rulesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 rounded border px-4 py-2 font-medium ${styles.rules}`}
                  >
                    <span>📄</span>
                    <span>VIEW RULES & REGULATIONS</span>
                  </a>
                </div>
              )}

              {(selectedEvent.coordinatorName || selectedEvent.coordinatorPhone || selectedEvent.contactName || selectedEvent.contactPhone || selectedEvent.trainerName) && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Contacts</h3>
                  <div className="rounded border border-gray-700 bg-gray-800/50 p-4 space-y-2">
                    {selectedEvent.trainerName && <p className="text-sm text-gray-300">Trainer: {selectedEvent.trainerName}</p>}
                    {selectedEvent.coordinatorName && <p className="text-sm font-semibold text-gray-200">{selectedEvent.coordinatorName}</p>}
                    {selectedEvent.coordinatorPhone && (
                      <a href={`tel:${selectedEvent.coordinatorPhone}`} className={`block font-mono text-sm ${styles.contact}`}>
                        {selectedEvent.coordinatorPhone}
                      </a>
                    )}
                    {selectedEvent.contactName && <p className="text-sm font-semibold text-gray-200">{selectedEvent.contactName}</p>}
                    {selectedEvent.contactPhone && (
                      <a href={`tel:${selectedEvent.contactPhone}`} className={`block font-mono text-sm ${styles.contact}`}>
                        {selectedEvent.contactPhone}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              disabled={
                registering ||
                !selectedEvent.isActive ||
                (selectedEvent.spotsLeft != null && selectedEvent.spotsLeft <= 0) ||
                (selectedEvent.teamsLeft != null && selectedEvent.teamsLeft <= 0)
              }
              onClick={() => handleRegister(selectedEvent)}
              className="w-full rounded-lg bg-gray-100 py-3 font-semibold text-gray-900 hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {!selectedEvent.isActive
                ? "REGISTRATION CLOSED"
                : selectedEvent.spotsLeft != null && selectedEvent.spotsLeft <= 0
                ? "EVENT FULL"
                : selectedEvent.teamsLeft != null && selectedEvent.teamsLeft <= 0
                ? "TEAM SLOTS FULL"
                : registering
                ? "REGISTERING..."
                : "REGISTER FOR THIS EVENT"}
            </button>
            {feedback && <p className="mt-3 text-xs text-gray-300">{feedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
