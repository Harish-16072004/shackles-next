import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { MemberDeleteForm, TeamDeleteForm } from '@/components/features/admin/EventRegistrationDeleteForms';
import { ChangeLeaderForm } from '@/components/features/admin/ChangeLeaderForm';
import { ArrowLeft, Download, Users, CheckCircle2, Trophy } from 'lucide-react';

const TYPE_ACCENT: Record<string, string> = {
    TECHNICAL: 'bg-blue-500',
    'NON-TECHNICAL': 'bg-purple-500',
    WORKSHOP: 'bg-amber-500',
    SPECIAL: 'bg-pink-500',
};
const TYPE_BADGE: Record<string, string> = {
    TECHNICAL: 'bg-blue-100 text-blue-700',
    'NON-TECHNICAL': 'bg-purple-100 text-purple-700',
    WORKSHOP: 'bg-amber-100 text-amber-700',
    SPECIAL: 'bg-pink-100 text-pink-700',
};

export default async function EventRegistrationDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ eventId: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await getSession();
    if (!session?.userId) redirect('/login');
    const user = await prisma.user.findUnique({ where: { id: session.userId as string } });
    if (!user || user.role !== 'ADMIN') redirect('/login');

    const { eventId } = await params;
    const resolvedSearchParams = (await searchParams) ?? {};
    const success = typeof resolvedSearchParams?.success === 'string' ? resolvedSearchParams.success : '';
    const error = typeof resolvedSearchParams?.error === 'string' ? resolvedSearchParams.error : '';

    const event = await prisma.event.findUnique({
        where: { id: eventId },
        include: {
            registrations: {
                include: {
                    user: true,
                    team: {
                        include: {
                            leader: {
                                select: { id: true, firstName: true, lastName: true },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'asc' },
            },
        },
    });

    if (!event) redirect('/admin/event-registrations');

    const totalRegistrations = event.registrations.reduce(
        (sum, reg) => sum + (reg.teamId ? 1 : reg.teamSize || 1),
        0
    );
    const attended = event.registrations.filter((r) => r.attended).length;

    // Build team groups
    const teamMap = new Map<
        string,
        {
            id: string;
            name: string;
            leaderUserId: string | null;
            members: typeof event.registrations;
        }
    >();

    for (const reg of event.registrations) {
        if (!reg.teamId) continue;
        const existing = teamMap.get(reg.teamId);
        if (existing) {
            existing.members.push(reg);
        } else {
            teamMap.set(reg.teamId, {
                id: reg.teamId,
                name: reg.team?.name || reg.teamName || 'Team',
                leaderUserId: reg.team?.leaderUserId ?? null,
                members: [reg],
            });
        }
    }

    const teams = Array.from(teamMap.values());
    const individuals = event.registrations.filter((r) => !r.teamId);
    const typeKey = (event.type || '').toUpperCase();

    return (
        <div className="min-h-screen bg-gray-50 p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* ── Back nav ── */}
                <Link
                    href="/admin/event-registrations"
                    className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft size={15} />
                    Back to Event Registrations
                </Link>

                {/* ── Success banner ── */}
                {success && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {success === 'leader-changed' && '✓ Team leader updated successfully.'}
                        {success === 'team-deleted' && '✓ Team deleted successfully.'}
                        {success === 'member-deleted' && '✓ Member removed successfully.'}
                    </div>
                )}

                {/* ── Error banner ── */}
                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error === 'missing-fields' && '✗ Required fields are missing.'}
                        {error === 'team-not-found' && '✗ Team not found.'}
                        {error === 'not-a-member' && '✗ Selected user is not a member of this team.'}
                        {error === 'already-leader' && '✗ That participant is already the team leader.'}
                        {error === 'missing-team' && '✗ Team ID is missing.'}
                        {error === 'missing-registration' && '✗ Registration ID is missing.'}
                        {error === 'registration-not-found' && '✗ Registration not found.'}
                    </div>
                )}

                {/* ── Event header card ── */}
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className={`h-1.5 ${TYPE_ACCENT[typeKey] ?? 'bg-gray-300'}`} />
                    <div className="p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 ${TYPE_BADGE[typeKey] ?? 'bg-gray-100 text-gray-600'}`}>
                                {event.type || 'N/A'}
                            </span>
                            <h1 className="text-2xl font-bold text-gray-900">{event.name}</h1>
                        </div>
                        <a
                            href={`/api/admin/csv/registrations/export?eventId=${encodeURIComponent(event.id)}`}
                            className="inline-flex items-center gap-2 shrink-0 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            <Download size={14} />
                            Download CSV
                        </a>
                    </div>

                    {/* Stat pills */}
                    <div className="px-6 pb-6 flex flex-wrap gap-3">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
                            <Users size={15} className="text-gray-400" />
                            <span className="text-sm font-semibold text-gray-800">{totalRegistrations}</span>
                            <span className="text-sm text-gray-500">total</span>
                        </div>
                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
                            <CheckCircle2 size={15} className="text-emerald-500" />
                            <span className="text-sm font-semibold text-emerald-700">{attended}</span>
                            <span className="text-sm text-emerald-600">attended</span>
                        </div>
                        {teams.length > 0 && (
                            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
                                <Trophy size={15} className="text-blue-500" />
                                <span className="text-sm font-semibold text-blue-700">{teams.length}</span>
                                <span className="text-sm text-blue-600">team{teams.length !== 1 ? 's' : ''}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Empty state ── */}
                {totalRegistrations === 0 && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center text-gray-400">
                        <Users size={32} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">No participants registered yet</p>
                    </div>
                )}

                {/* ── Teams section ── */}
                {teams.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">
                            Teams — {teams.length}
                        </h2>

                        <div className="space-y-3">
                            {teams.map((team) => (
                                <div
                                    key={team.id}
                                    className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
                                >
                                    {/* Team header row */}
                                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 gap-3 flex-wrap">
                                        <div>
                                            <p className="font-bold text-gray-900">{team.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {team.members.length} member{team.members.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {/* Change Leader — only shown when team has more than 1 member */}
                                            {team.members.length > 1 && (
                                                <ChangeLeaderForm
                                                    teamId={team.id}
                                                    teamName={team.name}
                                                    eventId={eventId}
                                                    currentLeaderUserId={team.leaderUserId}
                                                    members={team.members.map((reg) => ({
                                                        userId: reg.userId,
                                                        fullName: `${reg.user.firstName} ${reg.user.lastName}`,
                                                    }))}
                                                />
                                            )}
                                            <TeamDeleteForm teamId={team.id} teamName={team.name} eventId={eventId} />
                                        </div>
                                    </div>

                                    {/* Team member rows */}
                                    <div className="divide-y divide-gray-100">
                                        {team.members.map((reg) => {
                                            const isLeader =
                                                reg.memberRole === 'LEADER' ||
                                                reg.team?.leaderUserId === reg.userId;
                                            return (
                                                <div
                                                    key={reg.id}
                                                    className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {/* Avatar initial */}
                                                        <div
                                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isLeader
                                                                    ? 'bg-amber-100 text-amber-700'
                                                                    : 'bg-gray-100 text-gray-500'
                                                                }`}
                                                        >
                                                            {reg.user.firstName[0]}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-gray-900 truncate">
                                                                {reg.user.firstName} {reg.user.lastName}
                                                                {isLeader && (
                                                                    <span className="ml-2 text-xs font-normal text-amber-600">
                                                                        Leader
                                                                    </span>
                                                                )}
                                                            </p>
                                                            <p className="text-xs text-gray-500 truncate">{reg.user.email}</p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {reg.attended && (
                                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                                        )}
                                                        <MemberDeleteForm
                                                            registrationId={reg.id}
                                                            fullName={`${reg.user.firstName} ${reg.user.lastName}`}
                                                            hasTeam={true}
                                                            eventId={eventId}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ── Individual participants section ── */}
                {individuals.length > 0 && (
                    <section className="space-y-3">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">
                            Individual Participants — {individuals.length}
                        </h2>

                        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                            <div className="divide-y divide-gray-100">
                                {individuals.map((reg) => (
                                    <div
                                        key={reg.id}
                                        className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                                {reg.user.firstName[0]}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-gray-900 truncate">
                                                    {reg.user.firstName} {reg.user.lastName}
                                                </p>
                                                <p className="text-xs text-gray-500 truncate">{reg.user.email}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {reg.attended && (
                                                <CheckCircle2 size={14} className="text-emerald-500" />
                                            )}
                                            <MemberDeleteForm
                                                registrationId={reg.id}
                                                fullName={`${reg.user.firstName} ${reg.user.lastName}`}
                                                hasTeam={false}
                                                eventId={eventId}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

            </div>
        </div>
    );
}