'use client';

import { useState } from 'react';
import { X, Send, Users } from 'lucide-react';
import { sendTeamInvite } from '@/server/actions/event-registration';

interface InviteModalProps {
  eventId: string;
  teamCode: string;
  teamName: string;
  eventName: string;
  memberCount: number;
  teamMaxSize: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteModal({
  eventId,
  teamCode,
  teamName,
  eventName,
  memberCount,
  teamMaxSize,
  onClose,
  onSuccess,
}: InviteModalProps) {
  const slotsRemaining = teamMaxSize - memberCount;
  const [emails, setEmails] = useState<string[]>(
    Array(slotsRemaining).fill('')
  );
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function updateEmail(index: number, value: string) {
    setEmails(prev => prev.map((e, i) => (i === index ? value : e)));
  }

  async function handleSend() {
    const validEmails = emails.map(e => e.trim().toLowerCase()).filter(Boolean);
    if (validEmails.length === 0) {
      setFeedback({ type: 'error', text: 'Enter at least one email address.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmail = validEmails.find(e => !emailRegex.test(e));
    if (invalidEmail) {
      setFeedback({ type: 'error', text: `"${invalidEmail}" is not a valid email.` });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await sendTeamInvite({ eventId, teamCode, emails: validEmails });

      if (!res.success) {
        setFeedback({ type: 'error', text: res.error ?? 'Failed to send invites.' });
        return;
      }

      setFeedback({ type: 'success', text: res.message ?? 'Invites sent!' });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch {
      setFeedback({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users size={18} className="text-gray-400" />
              <h2 className="text-base font-semibold text-white">Invite Teammates</h2>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Team: <span className="font-medium text-gray-200">{teamName}</span>
              &nbsp;·&nbsp;{memberCount}/{teamMaxSize} members
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 transition hover:bg-gray-800 hover:text-white"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Team code display */}
        <div className="mb-5 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
          <p className="text-xs text-gray-400">Team Code</p>
          <p className="mt-0.5 font-mono text-xl font-bold tracking-widest text-white">
            {teamCode}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Teammates can also join directly using this code.
          </p>
        </div>

        {slotsRemaining === 0 ? (
          <p className="rounded-lg border border-yellow-800 bg-yellow-950 px-4 py-3 text-sm text-yellow-300">
            Your team is full ({teamMaxSize}/{teamMaxSize} members).
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-gray-400">
              Enter up to <span className="font-medium text-gray-200">{slotsRemaining}</span> email
              {slotsRemaining !== 1 ? 's' : ''} to invite:
            </p>

            <div className="space-y-2">
              {emails.map((email, i) => (
                <input
                  key={i}
                  type="email"
                  value={email}
                  onChange={e => updateEmail(i, e.target.value)}
                  placeholder={`Teammate ${i + 1} email`}
                  disabled={loading}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none transition focus:border-gray-400 disabled:opacity-50"
                />
              ))}
            </div>

            {feedback && (
              <p className={`mt-3 text-xs ${feedback.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                {feedback.text}
              </p>
            )}

            <button
              onClick={handleSend}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} />
              {loading ? 'Sending…' : 'Send Invites'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}