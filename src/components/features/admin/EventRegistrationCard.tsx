'use client';

import Link from 'next/link';
import { Users, ArrowRight, Download, CheckCircle2 } from 'lucide-react';

type EventRegistration = {
  id: string;
  userId: string;
  eventId: string;
  teamId: string | null;
  teamName: string | null;
  teamSize: number;
  attended: boolean;
  attendedAt: Date | null;
  memberRole: string | null;
  user: { firstName: string; lastName: string; email: string };
  team: { id: string; name: string; leaderUserId: string | null } | null;
};

type EventWithRegistrations = {
  id: string;
  name: string;
  type: string | null;
  registrations: EventRegistration[];
};

const TYPE_STYLES: Record<string, string> = {
  TECHNICAL: 'bg-blue-100 text-blue-700',
  'NON-TECHNICAL': 'bg-purple-100 text-purple-700',
  WORKSHOP: 'bg-amber-100 text-amber-700',
  SPECIAL: 'bg-pink-100 text-pink-700',
};

export default function EventRegistrationCard({ event }: { event: EventWithRegistrations }) {
  const totalRegistrations = event.registrations.reduce(
    (sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1), 0
  );
  const attended = event.registrations.filter((r) => r.attended).length;
  const attendancePercent = totalRegistrations > 0
    ? Math.round((attended / totalRegistrations) * 100)
    : 0;

  const typeKey = (event.type || '').toUpperCase().replace('-', '-');
  const typeBadgeClass = TYPE_STYLES[typeKey] ?? 'bg-gray-100 text-gray-600';

  const teamCount = new Set(
    event.registrations.filter((r) => r.teamId).map((r) => r.teamId)
  ).size;

  return (
    <div className="group relative bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Top accent line based on type */}
      <div className={`h-1 w-full ${typeKey === 'TECHNICAL' ? 'bg-blue-500' :
          typeKey === 'NON-TECHNICAL' ? 'bg-purple-500' :
            typeKey === 'WORKSHOP' ? 'bg-amber-500' :
              typeKey === 'SPECIAL' ? 'bg-pink-500' : 'bg-gray-300'
        }`} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${typeBadgeClass}`}>
              {event.type || 'N/A'}
            </span>
            <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
              {event.name}
            </h3>
          </div>
          {/* CSV download — stops propagation so it doesn't trigger Link */}
          <a
            href={`/api/admin/csv/registrations/export?eventId=${encodeURIComponent(event.id)}`}
            onClick={(e) => e.stopPropagation()}
            title="Download CSV"
            className="shrink-0 p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors"
          >
            <Download size={15} />
          </a>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-gray-400" />
            <span className="font-semibold text-gray-800">{totalRegistrations}</span>
            <span>{totalRegistrations === 1 ? 'participant' : 'participants'}</span>
          </div>
          {teamCount > 0 && (
            <div className="text-gray-400 text-xs">
              {teamCount} team{teamCount !== 1 ? 's' : ''}
            </div>
          )}
          {attended > 0 && (
            <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
              <CheckCircle2 size={12} />
              {attended} attended
            </div>
          )}
        </div>

        {/* Attendance progress bar */}
        {totalRegistrations > 0 && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Attendance</span>
              <span>{attendancePercent}%</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${attendancePercent}%` }}
              />
            </div>
          </div>
        )}

        {totalRegistrations === 0 && (
          <p className="text-xs text-gray-400 italic">No registrations yet</p>
        )}
      </div>

      {/* Footer CTA */}
      <Link
        href={`/admin/event-registrations/${event.id}`}
        className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors group/cta"
      >
        <span className="text-xs font-semibold text-gray-600 group-hover/cta:text-gray-900 transition-colors">
          View participants
        </span>
        <ArrowRight size={14} className="text-gray-400 group-hover/cta:text-gray-900 group-hover/cta:translate-x-0.5 transition-all" />
      </Link>
    </div>
  );
}