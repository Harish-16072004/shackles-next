'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, MapPin, Calendar, Users, User } from 'lucide-react';
import { InviteModal } from '@/components/features/InviteModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  name: string;
  description?: string | null;
  venue?: string | null;
  date?: string | null;
  endDate?: string | null;
  participationMode: 'SOLO' | 'TEAM';
  teamMinSize?: number | null;
  teamMaxSize?: number | null;
  trainerName?: string | null;
  coordinatorName?: string | null;
  coordinatorPhone?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  prizePool?: string | null;
  entryFee?: number | null;
}

interface MyTeamEntry {
  eventId: string;
  teamId: string | null;
  teamName: string;
  teamCode: string | null;
  joinCode: string | null;
  isLeader: boolean;
  memberCount: number;
  teamMaxSize: number;
  teamStatus: string;
  canInvite: boolean;
}

interface EventCategoryPageProps {
  category: string;
  subtitle?: string;
  events?: Event[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSchedule(date?: string | null, endDate?: string | null): string {
  if (!date) return 'TBD';
  const start = new Date(date).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!endDate) return start;
  const end = new Date(endDate).toLocaleString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${start} – ${end}`;
}

const TEAM_NAME_REGEX = /^[A-Za-z0-9 _-]{3,40}$/;

function validateTeamName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Team name is required.';
  if (!TEAM_NAME_REGEX.test(trimmed))
    return 'Team Name should be Technical or Legit, 3-40 characters consisting of letters, numbers, spaces, - or _ only.';
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventCategoryPage({
  category,
  subtitle,
  events = [],
}: EventCategoryPageProps) {
  const searchParams = useSearchParams();

  // Detail panel
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Registration form state
  const [teamName, setTeamName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [latestTeamCode, setLatestTeamCode] = useState<string | null>(null);

  useEffect(() => {
    const incomingCode = searchParams.get("teamCode");
    const incomingToken = searchParams.get("inviteToken");
    if (incomingCode) setJoinCode(incomingCode);
    if (incomingToken) setInviteToken(incomingToken);
  }, [searchParams]);

  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('error');

  // My registrations
  const [myTeamsByEventId, setMyTeamsByEventId] = useState<Record<string, MyTeamEntry>>({});
  const [soloEventIds, setSoloEventIds] = useState<string[]>([]);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);

  // ── Fetch my registrations ─────────────────────────────────────────────────

  const fetchMyRegistrations = useCallback(async () => {
    try {
      const res = await fetch('/api/events/my-registrations');
      if (!res.ok) return;
      const data = await res.json();

      const map: Record<string, MyTeamEntry> = {};
      (data.teams ?? []).forEach((t: MyTeamEntry) => {
        map[t.eventId] = t;
      });
      setMyTeamsByEventId(map);
      setSoloEventIds(data.soloEventIds ?? []);
    } catch {
      // silently ignore — user may not be logged in
    }
  }, []);

  useEffect(() => {
    fetchMyRegistrations();
  }, [fetchMyRegistrations]);

  // ── Clear form when panel changes ─────────────────────────────────────────

  useEffect(() => {
    setTeamName('');
    setJoinCode('');
    setLatestTeamCode(null);
    setFeedback(null);
    setRegistering(false);
  }, [selectedEvent?.id]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleRegister(eventId: string) {
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/events/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackType('error');
        setFeedback(data.error ?? 'Registration failed.');
        return;
      }
      setFeedbackType('success');
      setFeedback('Registered successfully!');
      await fetchMyRegistrations();
    } catch {
      setFeedbackType('error');
      setFeedback('Network error. Please try again.');
    } finally {
      setRegistering(false);
    }
  }

  async function handleCreateTeam() {
    if (!selectedEvent) return;
    const nameError = validateTeamName(teamName);
    if (nameError) {
      setFeedbackType('error');
      setFeedback(nameError);
      return;
    }
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/events/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, teamName: teamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackType('error');
        setFeedback(data.error ?? 'Failed to create team.');
        return;
      }
      setLatestTeamCode(data.teamCode ?? null);
      setFeedbackType('success');
      setFeedback('Team created! Share the code below with teammates.');
      await fetchMyRegistrations();
    } catch {
      setFeedbackType('error');
      setFeedback('Network error. Please try again.');
    } finally {
      setRegistering(false);
    }
  }

  async function handleJoinTeam() {
    if (!selectedEvent) return;
    const code = joinCode.trim();
    if (!code) {
      setFeedbackType('error');
      setFeedback('Enter a join code.');
      return;
    }
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/events/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEvent.id, joinCode: code, inviteToken: inviteToken || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackType('error');
        setFeedback(data.error ?? 'Failed to join team.');
        return;
      }
      setFeedbackType('success');
      setFeedback('Joined team successfully!');
      setJoinCode('');
      setInviteToken('');
      await fetchMyRegistrations();
    } catch {
      setFeedbackType('error');
      setFeedback('Network error. Please try again.');
    } finally {
      setRegistering(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">{category}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>

      <div className="flex h-[calc(100vh-89px)]">
        {/* ── Event list ──────────────────────────────────────────────────── */}
        <div className="w-full overflow-y-auto border-r border-gray-800 md:w-80 lg:w-96">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Calendar size={40} className="mb-3 text-gray-700" />
              <p className="text-sm text-gray-500">No events in this category yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-800/60">
              {events.map(event => {
                const myTeam = myTeamsByEventId[event.id];
                const isSoloReg = soloEventIds.includes(event.id);
                const isRegistered = !!myTeam || isSoloReg;

                return (
                  <li key={event.id}>
                    <button
                      onClick={() => setSelectedEvent(event)}
                      className={`w-full px-5 py-4 text-left transition hover:bg-gray-800/60 ${
                        selectedEvent?.id === event.id ? 'bg-gray-800/80' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-snug text-white">
                          {event.name}
                        </p>

                        {/* CTA badge */}
                        {isRegistered ? (
                          <span className="shrink-0 rounded-full bg-green-900/60 px-2.5 py-0.5 text-[10px] font-medium text-green-400">
                            ✓ Registered
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full border border-gray-700 px-2.5 py-0.5 text-[10px] text-gray-400">
                            Register
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {event.participationMode === 'TEAM' ? (
                          <span className="flex items-center gap-1">
                            <Users size={11} /> Team
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <User size={11} /> Solo
                          </span>
                        )}
                        {event.venue && (
                          <span className="flex items-center gap-1">
                            <MapPin size={11} /> {event.venue}
                          </span>
                        )}
                        {event.date && (
                          <span className="flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(event.date).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        )}
                      </div>

                      {/* Inline invite shortcut on card */}
                      {myTeam?.canInvite && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setShowInviteModal(true);
                          }}
                          className="mt-2 text-[10px] text-gray-400 underline underline-offset-2 transition hover:text-white"
                        >
                          + Invite teammates
                        </button>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Detail panel ────────────────────────────────────────────────── */}
        <div className="hidden flex-1 overflow-y-auto md:block">
          {selectedEvent ? (
            <div className="mx-auto max-w-2xl px-8 py-8">
              {/* Back (mobile fallback) */}
              <button
                onClick={() => setSelectedEvent(null)}
                className="mb-4 flex items-center gap-1 text-xs text-gray-500 transition hover:text-white md:hidden"
              >
                <ChevronLeft size={14} /> Back to events
              </button>

              {/* Event header */}
              <h2 className="text-xl font-bold">{selectedEvent.name}</h2>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                {selectedEvent.venue && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {selectedEvent.venue}
                  </span>
                )}
                {(selectedEvent.date || selectedEvent.endDate) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatSchedule(selectedEvent.date, selectedEvent.endDate)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  {selectedEvent.participationMode === 'TEAM' ? (
                    <><Users size={12} /> Team Event</>
                  ) : (
                    <><User size={12} /> Solo Event</>
                  )}
                </span>
              </div>

              {/* Description */}
              <p className="mt-5 text-sm leading-relaxed text-gray-300">
                {selectedEvent.description || 'No description available.'}
              </p>

              {/* Prize / Fee */}
              {(selectedEvent.prizePool || selectedEvent.entryFee != null) && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {selectedEvent.prizePool && (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Prize Pool</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">{selectedEvent.prizePool}</p>
                    </div>
                  )}
                  {selectedEvent.entryFee != null && (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-2.5">
                      <p className="text-[10px] uppercase tracking-wider text-gray-500">Entry Fee</p>
                      <p className="mt-0.5 text-sm font-semibold text-white">
                        {selectedEvent.entryFee === 0 ? 'Free' : `₹${selectedEvent.entryFee}`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Registration section ─────────────────────────────────── */}
              <div className="mt-6 border-t border-gray-800 pt-6">
                {selectedEvent.participationMode === 'TEAM' ? (
                  // ── Team event ─────────────────────────────────────────
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-gray-300">Team Registration</h3>

                    {myTeamsByEventId[selectedEvent.id] ? (
                      // Already in a team
                      <div className="space-y-2">
                        {/* Registered status card */}
                        <div className="rounded-lg border border-green-800/60 bg-green-950/30 px-4 py-3">
                          <p className="text-xs font-medium text-green-400">✓ Registered for this event</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-xs text-gray-400">
                              Team:{' '}
                              <span className="font-medium text-gray-200">
                                {myTeamsByEventId[selectedEvent.id].teamName}
                              </span>
                            </p>
                            {myTeamsByEventId[selectedEvent.id].isLeader && (
                              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-[10px] font-medium text-gray-300">
                                Leader
                              </span>
                            )}
                          </div>
                          {myTeamsByEventId[selectedEvent.id].teamCode && (
                            <p className="mt-1.5 font-mono text-lg font-bold tracking-widest text-white">
                              {myTeamsByEventId[selectedEvent.id].teamCode}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-gray-500">
                            {myTeamsByEventId[selectedEvent.id].memberCount} /{' '}
                            {selectedEvent.teamMaxSize ?? '∞'} members joined
                          </p>
                        </div>

                        {/* Invite card — leader only, team open */}
                        {myTeamsByEventId[selectedEvent.id].canInvite && (
                          <button
                            onClick={() => setShowInviteModal(true)}
                            className="w-full rounded-lg border border-dashed border-gray-600 bg-gray-800/40 px-4 py-3 text-left transition hover:border-gray-400 hover:bg-gray-800"
                          >
                            <p className="text-sm font-medium text-white">+ Invite Teammates</p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              Send email invites with team code &amp; join link
                            </p>
                          </button>
                        )}

                        {/* Non-leader notice */}
                        {!myTeamsByEventId[selectedEvent.id].isLeader && (
                          <p className="text-xs text-gray-500">
                            You joined as a member. Only the team leader can invite others.
                          </p>
                        )}
                      </div>
                    ) : (
                      // Not yet registered
                      <>
                        {/* Create team */}
                        <div className="flex gap-2">
                          <input
                            value={teamName}
                            onChange={e => setTeamName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateTeam()}
                            placeholder="Team name (Technical or Legit ONLY, 3-40 chars)"
                            disabled={registering}
                            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <button
                            onClick={handleCreateTeam}
                            disabled={registering || !teamName.trim()}
                            className="shrink-0 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Create
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-gray-800" />
                          <span className="text-xs text-gray-600">or join existing</span>
                          <div className="h-px flex-1 bg-gray-800" />
                        </div>

                        {/* Join team */}
                        <div className="flex gap-2">
                          <input
                            value={joinCode}
                            onChange={e => setJoinCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleJoinTeam()}
                            placeholder="Enter join code"
                            disabled={registering}
                            className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition focus:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                          <button
                            onClick={handleJoinTeam}
                            disabled={registering || !joinCode.trim()}
                            className="shrink-0 rounded-md border border-gray-700 px-4 py-2 text-sm text-white transition hover:border-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Join
                          </button>
                        </div>

                        {/* Newly created team code */}
                        {latestTeamCode && (
                          <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
                            <p className="text-xs text-gray-400">Team created! Share this code:</p>
                            <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-white">
                              {latestTeamCode}
                            </p>
                          </div>
                        )}

                        {/* Team size info */}
                        {(selectedEvent.teamMinSize != null || selectedEvent.teamMaxSize != null) && (
                          <p className="text-xs text-gray-500">
                            Team size:{' '}
                            {selectedEvent.teamMinSize ?? 2}–{selectedEvent.teamMaxSize ?? 4} members.
                            Others join using the team code or invite link.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  // ── Solo event ─────────────────────────────────────────
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-gray-300">Registration</h3>
                    {soloEventIds.includes(selectedEvent.id) ? (
                      <div className="rounded-lg border border-green-800/60 bg-green-950/30 px-4 py-3">
                        <p className="text-xs font-medium text-green-400">✓ Registered for this event</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRegister(selectedEvent.id)}
                        disabled={registering}
                        className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {registering ? 'Registering…' : 'Register Now'}
                      </button>
                    )}
                  </div>
                )}

                {/* Feedback message */}
                {feedback && (
                  <p
                    className={`mt-2 text-xs ${
                      feedbackType === 'error' ? 'text-red-400' : 'text-green-400'
                    }`}
                  >
                    {feedback}
                  </p>
                )}
              </div>

              {/* ── Contacts ─────────────────────────────────────────────── */}
              {(selectedEvent.trainerName ||
                selectedEvent.coordinatorName ||
                selectedEvent.contactName) && (
                <div className="mt-6 border-t border-gray-800 pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-gray-300">Contacts</h3>
                  <div className="space-y-2 text-xs text-gray-400">
                    {selectedEvent.trainerName && (
                      <p>
                        <span className="text-gray-500">Trainer: </span>
                        {selectedEvent.trainerName}
                      </p>
                    )}
                    {selectedEvent.coordinatorName && (
                      <p>
                        <span className="text-gray-500">Coordinator: </span>
                        {selectedEvent.coordinatorName}
                        {selectedEvent.coordinatorPhone && (
                          <a
                            href={`tel:${selectedEvent.coordinatorPhone}`}
                            className="ml-2 text-gray-300 underline underline-offset-2 transition hover:text-white"
                          >
                            {selectedEvent.coordinatorPhone}
                          </a>
                        )}
                      </p>
                    )}
                    {selectedEvent.contactName && (
                      <p>
                        <span className="text-gray-500">Contact: </span>
                        {selectedEvent.contactName}
                        {selectedEvent.contactPhone && (
                          <a
                            href={`tel:${selectedEvent.contactPhone}`}
                            className="ml-2 text-gray-300 underline underline-offset-2 transition hover:text-white"
                          >
                            {selectedEvent.contactPhone}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Empty state
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Calendar size={48} className="mb-4 text-gray-800" />
              <p className="text-sm text-gray-600">Select an event to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Invite modal ──────────────────────────────────────────────────── */}
      {showInviteModal && selectedEvent && myTeamsByEventId[selectedEvent.id] && (
        <InviteModal
          eventId={selectedEvent.id}
          teamCode={myTeamsByEventId[selectedEvent.id].teamCode!}
          teamName={myTeamsByEventId[selectedEvent.id].teamName}
          eventName={selectedEvent.name}
          memberCount={myTeamsByEventId[selectedEvent.id].memberCount}
          teamMaxSize={selectedEvent.teamMaxSize ?? 4}
          onClose={() => setShowInviteModal(false)}
          onSuccess={fetchMyRegistrations}
        />
      )}
    </div>
  );
}