'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Calendar, Users, User, X, ExternalLink, ChevronRight, ChevronLeft, MapPin } from 'lucide-react';
import Link from 'next/link';
import { InviteModal } from '@/components/features/InviteModal';
import {
  registerForIndividualEvent,
  createTeamViaForm,
  joinTeamViaCode,
  getMyRegistrations
} from '@/server/actions/event-registration';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Event {
  id: string;
  name: string;
  description?: string | null;
  venue?: string | null;
  date?: string | null;
  endDate?: string | null;
  rulesUrl?: string | null;
  participationMode: 'TEAM' | 'INDIVIDUAL';
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
  inviteToken?: string;
  teamCode?: string;
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

function formatShortDate(date?: string | null): string {
  if (!date) return 'TBD';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

const TEAM_NAME_REGEX = /^[A-Za-z0-9 _-]{3,40}$/;

function validateTeamName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Team name is required.';
  if (!TEAM_NAME_REGEX.test(trimmed))
    return 'Team Name should be Technical or Legit, 3-40 characters consisting of letters, numbers, spaces, - or _ only.';
  return null;
}

function isTeamEvent(mode: string): boolean {
  return mode === 'TEAM';
}

// ─── Accent color map ─────────────────────────────────────────────────────────

const accentMap: Record<string, { border: string; bg: string; text: string; badge: string; hoverBorder: string; cardGlow: string }> = {
  TECHNICAL: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    badge: 'bg-rose-100 text-rose-700',
    hoverBorder: 'hover:border-rose-400',
    cardGlow: 'hover:shadow-rose-100/60',
  },
  'NON-TECHNICAL': {
    border: 'border-cyan-200',
    bg: 'bg-cyan-50',
    text: 'text-cyan-600',
    badge: 'bg-cyan-100 text-cyan-700',
    hoverBorder: 'hover:border-cyan-400',
    cardGlow: 'hover:shadow-cyan-100/60',
  },
  SPECIAL: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    hoverBorder: 'hover:border-emerald-400',
    cardGlow: 'hover:shadow-emerald-100/60',
  },
};

const defaultAccent = accentMap['TECHNICAL'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function EventCategoryPage({
  category,
  subtitle,
  events = [],
  inviteToken: inviteTokenFromUrl,
  teamCode: teamCodeFromUrl,
}: EventCategoryPageProps) {
  const searchParams = useSearchParams();
  const accent = accentMap[category] ?? defaultAccent;

  // Modal and Detail panel state
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
  const [individualEventIds, setIndividualEventIds] = useState<string[]>([]);

  // Invite modal
  const [showInviteModal, setShowInviteModal] = useState(false);

  // ── Fetch my registrations ─────────────────────────────────────────────────

  const fetchMyRegistrations = useCallback(async () => {
    try {
      const res = await getMyRegistrations();
      if (!res.success) return;

      const map: Record<string, MyTeamEntry> = {};
      (res.teams ?? []).forEach((t: MyTeamEntry) => {
        map[t.eventId] = t;
      });
      setMyTeamsByEventId(map);
      setIndividualEventIds(res.individualEventIds ?? []);
    } catch {
      // silently ignore — user may not be logged in
    }
  }, []);

  useEffect(() => {
    fetchMyRegistrations();
  }, [fetchMyRegistrations]);

  // ── Clear form when modal changes ─────────────────────────────────────────

  const [inviteHandled, setInviteHandled] = useState(false);

  useEffect(() => {
    // Don't clear if this is from an invite link — the invite effect will set the joinCode
    if (teamCodeFromUrl && !inviteHandled) return;
    setTeamName('');
    setJoinCode('');
    setLatestTeamCode(null);
    setFeedback(null);
    setRegistering(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent?.id]);

  // ── Auto-join from invite link ─────────────────────────────────────────────

  useEffect(() => {
    if (inviteHandled || !teamCodeFromUrl || events.length === 0) return;
    setInviteHandled(true);

    // Find the team event that matches (team events only have teamCode-based join)
    // We open the first team event since the /events page already routed us to the correct category
    const teamEvent = events.find(e => isTeamEvent(e.participationMode));
    if (!teamEvent) {
      // If no team event, try the first event
      if (events.length > 0) setSelectedEvent(events[0]);
      return;
    }

    setSelectedEvent(teamEvent);
    setJoinCode(teamCodeFromUrl);

    // Auto-submit the join request if we have an inviteToken
    if (inviteTokenFromUrl) {
      (async () => {
        setRegistering(true);
        setFeedback(null);
        try {
          const res = await joinTeamViaCode({
            eventName: teamEvent.name,
            teamCode: teamCodeFromUrl,
            inviteToken: inviteTokenFromUrl,
          });

          if (!res.success) {
            setFeedbackType('error');
            setFeedback(res.error ?? 'Failed to join team via invite.');
          } else {
            setFeedbackType('success');
            setFeedback(res.message ?? 'Joined team successfully!');
            await fetchMyRegistrations();
          }
        } catch {
          setFeedbackType('error');
          setFeedback('Network error. Please try again.');
        } finally {
          setRegistering(false);
        }
      })();
    }
  }, [teamCodeFromUrl, inviteTokenFromUrl, events, inviteHandled, fetchMyRegistrations]);

  // Close modal on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEvent(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleRegister() {
    setRegistering(true);
    setFeedback(null);
    try {
      const res = await registerForIndividualEvent({ eventName: selectedEvent?.name ?? '' });
      if (!res.success) {
        setFeedbackType('error');
        setFeedback(res.error ?? 'Registration failed.');
        return;
      }
      setFeedbackType('success');
      setFeedback(res.message || 'Registered successfully!');
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
      const res = await createTeamViaForm({
        eventName: selectedEvent.name,
        teamName: teamName.trim(),
      });

      if (!res.success) {
        setFeedbackType('error');
        setFeedback(res.error ?? 'Failed to create team.');
        return;
      }
      setLatestTeamCode(res.teamCode ?? null);
      setFeedbackType('success');
      setFeedback(res.message || 'Team created! Share the code below with teammates.');
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
      const res = await joinTeamViaCode({
        eventName: selectedEvent.name,
        teamCode: code,
        inviteToken: inviteToken || undefined,
      });

      if (!res.success) {
        setFeedbackType('error');
        setFeedback(res.error ?? 'Failed to join team.');
        return;
      }
      setFeedbackType('success');
      setFeedback(res.message || 'Joined team successfully!');
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

  function isRegistered(eventId: string): boolean {
    return !!myTeamsByEventId[eventId] || individualEventIds.includes(eventId);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pb-12">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition hover:text-gray-900"
        >
          <ChevronLeft size={16} />
          Back to Events
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">{category}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-gray-500">{subtitle}</p>}
      </div>

      {/* Event Grid */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-24 text-center">
          <Calendar size={48} className="mb-4 text-gray-300" />
          <p className="text-base font-medium text-gray-400">No events in this category yet.</p>
          <p className="mt-1 text-sm text-gray-400">Check back later or contact the organizers.</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(event => {
            const registered = isRegistered(event.id);
            const team = isTeamEvent(event.participationMode);

            return (
              <button
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`group relative flex flex-col rounded-2xl border-2 bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${accent.border} ${accent.hoverBorder} ${accent.cardGlow}`}
              >
                {/* Registered indicator */}
                {registered && (
                  <span className="absolute right-3 top-3 rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-semibold text-green-700">
                    ✓ Registered
                  </span>
                )}

                {/* Event Name */}
                <h3 className="pr-20 text-lg font-bold text-gray-900 group-hover:text-gray-700">
                  {event.name}
                </h3>

                {/* Meta info */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* Mode badge */}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${accent.badge}`}>
                    {team ? <Users size={12} /> : <User size={12} />}
                    {team ? 'Team' : 'Individual'}
                  </span>

                  {/* Date badge */}
                  {event.date && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                      <Calendar size={12} />
                      {formatShortDate(event.date)}
                    </span>
                  )}

                  {/* Team size */}
                  {team && (event.teamMinSize || event.teamMaxSize) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                      {event.teamMinSize ?? 2}–{event.teamMaxSize ?? 4} members
                    </span>
                  )}
                </div>

                {/* Description preview */}
                {event.description && (
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-500">
                    {event.description}
                  </p>
                )}

                {/* Bottom CTA */}
                <div className={`mt-auto flex items-center gap-1.5 pt-4 text-xs font-semibold uppercase tracking-wide ${accent.text}`}>
                  <span>View Details</span>
                  <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Registration Modal ────────────────────────────────────────────── */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className={`sticky top-0 z-10 flex items-start justify-between rounded-t-2xl border-b border-gray-100 bg-white px-6 pt-6 pb-4`}>
              <div className="pr-8">
                <h2 className="text-xl font-bold text-gray-900">{selectedEvent.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${accent.badge}`}>
                    {isTeamEvent(selectedEvent.participationMode)
                      ? <><Users size={12} /> Team Event</>
                      : <><User size={12} /> Individual Event</>
                    }
                  </span>
                  {(selectedEvent.date || selectedEvent.endDate) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                      <Calendar size={12} />
                      {formatSchedule(selectedEvent.date, selectedEvent.endDate)}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              {/* Description */}
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">About</h4>
                <p className="text-sm leading-relaxed text-gray-600">
                  {selectedEvent.description || 'No description available.'}
                </p>
              </div>

              {/* Rules link */}
              {selectedEvent.rulesUrl && (
                <a
                  href={selectedEvent.rulesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 rounded-lg border-2 ${accent.border} ${accent.bg} px-4 py-2.5 text-sm font-semibold ${accent.text} transition hover:opacity-80`}
                >
                  <ExternalLink size={15} />
                  Rules & Regulations
                </a>
              )}

              {/* Prize / Fee */}
              {(selectedEvent.prizePool || selectedEvent.entryFee != null) && (
                <div className="flex flex-wrap gap-3">
                  {selectedEvent.prizePool && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Prize Pool</p>
                      <p className="mt-0.5 text-base font-bold text-gray-900">{selectedEvent.prizePool}</p>
                    </div>
                  )}
                  {selectedEvent.entryFee != null && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Entry Fee</p>
                      <p className="mt-0.5 text-base font-bold text-gray-900">
                        {selectedEvent.entryFee === 0 ? 'Free' : `₹${selectedEvent.entryFee}`}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Registration Section ─────────────────────────────────── */}
              <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Registration
                </h4>

                {isTeamEvent(selectedEvent.participationMode) ? (
                  // ── Team Registration ──
                  <div className="space-y-3">
                    {myTeamsByEventId[selectedEvent.id] ? (
                      // Already in a team
                      <div className="space-y-3">
                        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                          <p className="text-sm font-semibold text-green-700">✓ Registered</p>
                          <div className="mt-1.5 flex items-center gap-2">
                            <p className="text-xs text-gray-600">
                              Team: <span className="font-semibold text-gray-800">{myTeamsByEventId[selectedEvent.id].teamName}</span>
                            </p>
                            {myTeamsByEventId[selectedEvent.id].isLeader && (
                              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold text-gray-600">Leader</span>
                            )}
                          </div>
                          {myTeamsByEventId[selectedEvent.id].teamCode && (
                            <p className="mt-2 font-mono text-lg font-bold tracking-widest text-gray-900">
                              {myTeamsByEventId[selectedEvent.id].teamCode}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-gray-500">
                            {myTeamsByEventId[selectedEvent.id].memberCount} / {selectedEvent.teamMaxSize ?? '∞'} members joined
                          </p>
                        </div>

                        {myTeamsByEventId[selectedEvent.id].canInvite && (
                          <button
                            onClick={() => setShowInviteModal(true)}
                            className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-left transition hover:border-gray-400 hover:bg-gray-50"
                          >
                            <p className="text-sm font-semibold text-gray-800">+ Invite Teammates</p>
                            <p className="mt-0.5 text-xs text-gray-500">Send email invites with team code & join link</p>
                          </button>
                        )}

                        {!myTeamsByEventId[selectedEvent.id].isLeader && (
                          <p className="text-xs text-gray-500">You joined as a member. Only the team leader can invite others.</p>
                        )}
                      </div>
                    ) : (
                      // Not yet registered for team event
                      <div className="space-y-3">
                        {/* Team size info */}
                        {(selectedEvent.teamMinSize != null || selectedEvent.teamMaxSize != null) && (
                          <p className="text-xs text-gray-500">
                            Team size: {selectedEvent.teamMinSize ?? 2}–{selectedEvent.teamMaxSize ?? 4} members.
                          </p>
                        )}

                        {/* Create team */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Create a new team</label>
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
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-gray-200" />
                          <span className="text-xs text-gray-400">or join existing</span>
                          <div className="h-px flex-1 bg-gray-200" />
                        </div>

                        {/* Join team */}
                        <div>
                          <label className="mb-1 block text-xs font-medium text-gray-600">Join with a code</label>
                          <div className="flex gap-2">
                            <input
                              value={joinCode}
                              onChange={e => setJoinCode(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleJoinTeam()}
                              placeholder="Enter join code"
                              disabled={registering}
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-gray-500 focus:ring-2 focus:ring-gray-200 disabled:opacity-50"
                            />
                            <button
                              onClick={handleJoinTeam}
                              disabled={registering || !joinCode.trim()}
                              className="shrink-0 rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Join
                            </button>
                          </div>
                        </div>

                        {/* Newly created team code */}
                        {latestTeamCode && (
                          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                            <p className="text-xs text-gray-500">Team created! Share this code:</p>
                            <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-gray-900">
                              {latestTeamCode}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  // ── Individual Registration ──
                  <div>
                    {individualEventIds.includes(selectedEvent.id) ? (
                      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                        <p className="text-sm font-semibold text-green-700">✓ Registered for this event</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRegister()}
                        disabled={registering}
                        className="w-full rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {registering ? 'Registering…' : 'Register Now'}
                      </button>
                    )}
                  </div>
                )}

                {/* Feedback message */}
                {feedback && (
                  <p className={`mt-2 text-xs font-medium ${feedbackType === 'error' ? 'text-red-500' : 'text-green-600'}`}>
                    {feedback}
                  </p>
                )}
              </div>

              {/* Contacts */}
              {(selectedEvent.trainerName || selectedEvent.coordinatorName || selectedEvent.contactName) && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Contacts</h4>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    {selectedEvent.trainerName && (
                      <p><span className="text-gray-400">Trainer:</span> {selectedEvent.trainerName}</p>
                    )}
                    {selectedEvent.coordinatorName && (
                      <p>
                        <span className="text-gray-400">Coordinator:</span> {selectedEvent.coordinatorName}
                        {selectedEvent.coordinatorPhone && (
                          <a href={`tel:${selectedEvent.coordinatorPhone}`} className="ml-2 text-gray-700 underline underline-offset-2 transition hover:text-gray-900">
                            {selectedEvent.coordinatorPhone}
                          </a>
                        )}
                      </p>
                    )}
                    {selectedEvent.contactName && (
                      <p>
                        <span className="text-gray-400">Contact:</span> {selectedEvent.contactName}
                        {selectedEvent.contactPhone && (
                          <a href={`tel:${selectedEvent.contactPhone}`} className="ml-2 text-gray-700 underline underline-offset-2 transition hover:text-gray-900">
                            {selectedEvent.contactPhone}
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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