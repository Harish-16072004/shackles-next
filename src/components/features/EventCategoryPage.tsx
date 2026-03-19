"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useSearchParams } from "next/navigation";

type EventItem = {
  id: string;
  name: string;
  type: string | null;
  dayLabel: string | null;
  date: string | null;
  endDate: string | null;
  description: string | null;
  rulesUrl: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  trainerName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  participationMode: "INDIVIDUAL" | "TEAM";
  isAllDay: boolean;
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

function formatSchedule(date: string | null, endDate: string | null) {
  if (!date) return null;

  const start = new Date(date);
  if (Number.isNaN(start.getTime())) return null;

  const startText = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);

  if (!endDate) return startText;

  const end = new Date(endDate);
  if (Number.isNaN(end.getTime()) || end.getTime() === start.getTime()) return startText;

  const endText = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(end);

  return `${startText} → ${endText}`;
}

const PAYMENT_PENDING_POPUP = "Your payment verification is pending by organizers. Please try after sometime.";
const LOGIN_REQUIRED_POPUP = "Please login to register for events.";

function shouldShowPaymentPendingPopup(status: number, message: string) {
  const normalized = message.toLowerCase();
  return status === 403 && (
    normalized.includes("payment-verified") ||
    normalized.includes("payment verified") ||
    normalized.includes("payment")
  );
}

function shouldShowLoginPopup(status: number): boolean {
  return status === 401;
}

export default function EventCategoryPage({ category, title, subtitle, accent }: Props) {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamCode, setTeamCode] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [latestTeamCode, setLatestTeamCode] = useState("");
  const [registering, setRegistering] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [completingTeam, setCompletingTeam] = useState(false);
  const [feedback, setFeedback] = useState("");
  const styles = accentStyles[accent];

  useEffect(() => {
    const incomingToken = searchParams.get("inviteToken") || "";
    const incomingCode = searchParams.get("teamCode") || "";

    if (incomingToken) setInviteToken(incomingToken);
    if (incomingCode) setTeamCode(incomingCode);
  }, [searchParams]);

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
      setTeamCode("");
      setInviteToken("");
      setLatestTeamCode("");
      return;
    }

    if (selectedEvent.participationMode !== "TEAM") {
      setTeamName("");
      setTeamCode("");
      setInviteToken("");
      setLatestTeamCode("");
      return;
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) return;
    const updated = events.find((event) => event.id === selectedEvent.id);
    if (updated) {
      setSelectedEvent(updated);
    }
  }, [events, selectedEvent]);

  async function handleRegister(event: EventItem) {
    try {
      setRegistering(true);
      setFeedback("");

      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "joinTeam",
          eventName: event.name,
          teamName: teamName.trim() || undefined,
          teamCode: teamCode.trim() || undefined,
          inviteToken: inviteToken.trim() || undefined,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = typeof body.error === "string" ? body.error : "Unable to register now.";
        setFeedback(errorMessage);
        if (shouldShowLoginPopup(response.status)) {
          alert(LOGIN_REQUIRED_POPUP);
        } else if (shouldShowPaymentPendingPopup(response.status, errorMessage)) {
          alert(PAYMENT_PENDING_POPUP);
        }
      } else {
        if (body.teamCode) {
          setLatestTeamCode(String(body.teamCode));
          setTeamCode(String(body.teamCode));
        }
        const message = typeof body.message === "string" ? body.message : "";
        if (message.toLowerCase().includes("already registered")) {
          setFeedback(message);
        } else {
          setFeedback("Joined team successfully.");
        }
        await loadEvents();
      }
    } finally {
      setRegistering(false);
    }
  }

  async function handleCreateTeam(event: EventItem) {
    const trimmedTeamName = teamName.trim();
    if (!trimmedTeamName) {
      setFeedback("Team name is required to create a team.");
      return;
    }

    try {
      setCreatingTeam(true);
      setFeedback("");
      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTeam",
          eventName: event.name,
          teamName: trimmedTeamName,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = typeof body.error === "string" ? body.error : "Unable to create team right now.";
        setFeedback(errorMessage);
        if (shouldShowLoginPopup(response.status)) {
          alert(LOGIN_REQUIRED_POPUP);
        } else if (shouldShowPaymentPendingPopup(response.status, errorMessage)) {
          alert(PAYMENT_PENDING_POPUP);
        }
      } else {
        if (body.teamCode) {
          setLatestTeamCode(String(body.teamCode));
          setTeamCode(String(body.teamCode));
        }
        const message = typeof body.message === "string" ? body.message : "";
        if (message.toLowerCase().includes("already registered")) {
          setFeedback(message);
        } else {
          setFeedback("Team created successfully.");
        }
        await loadEvents();
      }
    } finally {
      setCreatingTeam(false);
    }
  }

  async function handleCompleteTeam(event: EventItem) {
    const trimmedTeamName = teamName.trim();
    const trimmedTeamCode = teamCode.trim();
    if (!trimmedTeamName && !trimmedTeamCode) {
      setFeedback("Provide Team Name or Team Code to complete team registration.");
      return;
    }

    try {
      setCompletingTeam(true);
      setFeedback("");

      const response = await fetch("/api/events/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "completeTeam",
          eventName: event.name,
          teamName: trimmedTeamName || undefined,
          teamCode: trimmedTeamCode || undefined,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMessage = typeof body.error === "string" ? body.error : "Unable to complete team registration now.";
        setFeedback(errorMessage);
        if (shouldShowLoginPopup(response.status)) {
          alert(LOGIN_REQUIRED_POPUP);
        } else if (shouldShowPaymentPendingPopup(response.status, errorMessage)) {
          alert(PAYMENT_PENDING_POPUP);
        }
      } else {
        if (body.teamCode) {
          setLatestTeamCode(String(body.teamCode));
          setTeamCode(String(body.teamCode));
        }
        setFeedback(body.message || "Team registration completed.");
        await loadEvents();
      }
    } finally {
      setCompletingTeam(false);
    }
  }

  return (
    <div className="flex flex-col gap-12 pb-8">
      <section className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-semibold text-gray-900">{title}</h1>
        <p className="text-lg text-gray-600">{subtitle}</p>
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
              <p className="text-xs text-gray-500 mt-auto">{isClosed ? "Closed" : "Open"}</p>
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

            {formatSchedule(selectedEvent.date, selectedEvent.endDate) && (
              <p className="mb-4 rounded border border-gray-700 bg-gray-800/40 px-3 py-2 text-xs text-gray-200">
                Schedule: {formatSchedule(selectedEvent.date, selectedEvent.endDate)}
              </p>
            )}

            <p className="mb-6 text-sm leading-relaxed text-gray-300">{selectedEvent.description || "No description available."}</p>

            {selectedEvent.participationMode === "TEAM" && (
              <div className="mb-6 rounded border border-gray-700 bg-gray-800/40 p-4">
                <p className="mb-3 text-sm font-semibold text-gray-100">Team Registration</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">Create Team</p>
                    <input
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                      placeholder="Team name"
                      className="w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                    />
                    <button
                      disabled={creatingTeam || registering || completingTeam || !selectedEvent.isActive}
                      onClick={() => handleCreateTeam(selectedEvent)}
                      className="mt-3 w-full rounded-lg border border-emerald-500 bg-emerald-600/20 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatingTeam ? "CREATING TEAM..." : "CREATE TEAM (LEADER)"}
                    </button>
                  </div>
                  <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">Join Team</p>
                    <div className="grid gap-2">
                      <input
                        value={teamCode}
                        onChange={(event) => setTeamCode(event.target.value.toUpperCase())}
                        placeholder="Team code"
                        className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                      />
                      <input
                        value={inviteToken}
                        onChange={(event) => setInviteToken(event.target.value)}
                        placeholder="Invite token (optional)"
                        className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none focus:border-gray-400"
                      />
                    </div>
                    <button
                      disabled={registering || creatingTeam || completingTeam || !selectedEvent.isActive}
                      onClick={() => handleRegister(selectedEvent)}
                      className="mt-3 w-full rounded-lg border border-cyan-500 bg-cyan-600/20 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {registering ? "JOINING TEAM..." : "JOIN TEAM"}
                    </button>
                  </div>
                </div>
                {latestTeamCode && (
                  <p className="mt-3 rounded border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-200">
                    Team created. Share this code: <span className="font-mono font-semibold">{latestTeamCode}</span>
                  </p>
                )}
                {(selectedEvent.teamMinSize != null || selectedEvent.teamMaxSize != null) && (
                  <p className="mt-2 text-xs text-gray-400">
                    Team size required to complete: {selectedEvent.teamMinSize ?? 2} - {selectedEvent.teamMaxSize ?? 4}. Members should join with Team Code or Invite Token.
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
                creatingTeam ||
                completingTeam ||
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
                ? selectedEvent.participationMode === "TEAM"
                  ? "JOINING TEAM..."
                  : "REGISTERING..."
                : selectedEvent.participationMode === "TEAM"
                ? "JOIN TEAM"
                : "REGISTER FOR THIS EVENT"}
            </button>
            {selectedEvent.participationMode === "TEAM" && (
              <button
                disabled={completingTeam || registering || creatingTeam || !selectedEvent.isActive}
                onClick={() => handleCompleteTeam(selectedEvent)}
                className="mt-3 w-full rounded-lg border border-gray-500 py-3 font-semibold text-gray-100 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {completingTeam ? "COMPLETING TEAM..." : "COMPLETE & LOCK TEAM (LEADER)"}
              </button>
            )}
            {feedback && <p className="mt-3 text-xs text-gray-300">{feedback}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
