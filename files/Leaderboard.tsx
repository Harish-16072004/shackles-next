"use client";

import { useLeaderboardSSE } from "@/hooks/useLeaderboardSSE";

interface LeaderboardProps {
  eventId: string;
  eventName: string;
}

export function Leaderboard({ eventId, eventName }: LeaderboardProps) {
  const { entries, connected, error } = useLeaderboardSSE({ eventId });

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">{eventName}</h2>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-400"
            }`}
          />
          <span className="text-gray-500">
            {connected ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          {error}
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && !error && (
        <div className="text-center py-12 text-gray-400 text-sm">
          Waiting for scores…
        </div>
      )}

      {/* Leaderboard rows */}
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.participantId}
            className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-100 rounded-xl"
          >
            {/* Rank badge */}
            <span
              className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-medium shrink-0 ${
                entry.rank === 1
                  ? "bg-amber-100 text-amber-800"
                  : entry.rank === 2
                  ? "bg-gray-100 text-gray-700"
                  : entry.rank === 3
                  ? "bg-orange-50 text-orange-700"
                  : "bg-gray-50 text-gray-500"
              }`}
            >
              {entry.rank}
            </span>

            {/* Name + ID */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {entry.name}
                {entry.isTeam && (
                  <span className="ml-2 text-xs text-gray-400">(team)</span>
                )}
              </p>
              {entry.shacklesId && (
                <p className="text-xs text-gray-400">{entry.shacklesId}</p>
              )}
            </div>

            {/* Score */}
            <span className="text-base font-medium text-gray-800 tabular-nums shrink-0">
              {entry.totalScore}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
