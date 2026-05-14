'use client';

import { useState, useTransition } from 'react';
import { Crown } from 'lucide-react';
import { changeTeamLeader } from '@/server/actions/event-logistics';

type Member = {
    userId: string;
    fullName: string;
};

type ChangeLeaderFormProps = {
    teamId: string;
    teamName: string;
    eventId: string;
    currentLeaderUserId: string | null;
    members: Member[]; // all members of this team
};

export function ChangeLeaderForm({
    teamId,
    teamName,
    eventId,
    currentLeaderUserId,
    members,
}: ChangeLeaderFormProps) {
    const [open, setOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [isPending, startTransition] = useTransition();

    const eligibleMembers = members.filter((m) => m.userId !== currentLeaderUserId);

    const handleSubmit = () => {
        if (!selectedUserId) return;

        const chosen = members.find((m) => m.userId === selectedUserId);
        const ok = window.confirm(
            `Promote "${chosen?.fullName}" as leader of team "${teamName}"?\nThe current leader will be demoted to member.`
        );
        if (!ok) return;

        startTransition(async () => {
            const result = await changeTeamLeader({ teamId, newLeaderUserId: selectedUserId, eventId });
            if (result.success) {
                window.location.reload();
            } else {
                alert(result.error || 'Failed to change leader');
            }
        });
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-amber-300 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
                <Crown size={11} />
                Change Leader
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 flex-wrap">
            <select
                name="newLeaderUserId"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="text-xs rounded border border-gray-300 px-2 py-1 bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
                <option value="" disabled>Select new leader…</option>
                {eligibleMembers.map((m) => (
                    <option key={m.userId} value={m.userId}>{m.fullName}</option>
                ))}
            </select>

            <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedUserId || isPending}
                className="rounded-sm border border-amber-400 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                {isPending ? 'Saving...' : 'Confirm'}
            </button>
            <button
                type="button"
                onClick={() => { setOpen(false); setSelectedUserId(''); }}
                className="rounded-sm border border-gray-300 px-2 py-1 text-[11px] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
                Cancel
            </button>
        </div>
    );
}