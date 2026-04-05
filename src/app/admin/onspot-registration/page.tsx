import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import {
  approveOnSpotPayment,
  createOnSpotParticipant,
  getOnSpotParticipants,
  getOnSpotSummary,
  rejectOnSpotPayment,
} from '@/server/actions/onspot-registration';

type SearchParams = {
  tab?: string;
  status?: string;
  channel?: string;
  q?: string;
  state?: string;
};

type PaymentChannelFilter = 'CASH' | 'ONLINE' | 'ALL';
type PaymentStatusFilter = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'ALL';

function asChannel(value: string | undefined): PaymentChannelFilter {
  if (value === 'CASH') return 'CASH';
  if (value === 'ONLINE') return 'ONLINE';
  return 'ALL';
}

function asStatus(value: string | undefined): PaymentStatusFilter {
  if (value === 'PENDING') return 'PENDING';
  if (value === 'VERIFIED') return 'VERIFIED';
  if (value === 'REJECTED') return 'REJECTED';
  return 'ALL';
}

function formatDate(value?: Date | null) {
  if (!value) return '--';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

function formatINR(amount?: number | null) {
  if (amount == null) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function OnSpotRegistrationPage({ searchParams }: { searchParams?: SearchParams }) {
  const session = await getSession();
  if (!session?.userId) {
    redirect('/login');
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: { role: true },
  });

  if (!currentUser || currentUser.role !== 'ADMIN') {
    redirect('/login');
  }

  const tab = searchParams?.tab === 'verify' || searchParams?.tab === 'users' ? searchParams.tab : 'register';
  const selectedStatus = asStatus(searchParams?.status);
  const selectedChannel = asChannel(searchParams?.channel);
  const search = (searchParams?.q || '').trim();
  const stateMessage = searchParams?.state || '';

  const [summaryResult, participantsResult] = await Promise.all([
    getOnSpotSummary(),
    getOnSpotParticipants({
      status: selectedStatus,
      paymentChannel: selectedChannel,
      search,
    }),
  ]);

  const summary = summaryResult.success
    ? summaryResult.data
    : { total: 0, pending: 0, verified: 0, rejected: 0, cash: 0, online: 0 };

  const participants = participantsResult.success ? participantsResult.data : [];
  const showActionsColumn = participants.some((participant) => participant.payment?.status === 'PENDING');

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">On-Spot Registration Console</h1>
            <p className="text-sm text-gray-600 mt-1">Create on-spot users, verify payments, and manage on-spot participant lifecycle.</p>
          </div>
          <a
            href="/admin/scanner-v2"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-semibold hover:bg-cyan-700"
          >
            Open Scanner v2
          </a>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Total</p>
            <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Pending</p>
            <p className="text-2xl font-bold text-amber-600">{summary.pending}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Verified</p>
            <p className="text-2xl font-bold text-green-600">{summary.verified}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Rejected</p>
            <p className="text-2xl font-bold text-red-600">{summary.rejected}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Cash</p>
            <p className="text-2xl font-bold text-blue-700">{summary.cash}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Online</p>
            <p className="text-2xl font-bold text-purple-700">{summary.online}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {[
            { key: 'register', label: 'Register' },
            { key: 'verify', label: 'Verify Payments' },
            { key: 'users', label: 'On-Spot Users' },
          ].map((item) => {
            const active = tab === item.key;
            return (
              <a
                key={item.key}
                href={`/admin/onspot-registration?tab=${item.key}`}
                className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                  active
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>

        {stateMessage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 text-blue-800 px-4 py-3 text-sm">
            {stateMessage}
          </div>
        )}

        {tab === 'register' && (
          <div className="bg-white rounded-xl border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create On-Spot Participant</h2>
            <form
              action={async (formData) => {
                'use server';

                const amount = Number(formData.get('amount') || 0);
                const result = await createOnSpotParticipant({
                  firstName: String(formData.get('firstName') || ''),
                  lastName: String(formData.get('lastName') || ''),
                  email: String(formData.get('email') || ''),
                  phone: String(formData.get('phone') || ''),
                  password: String(formData.get('password') || ''),
                  collegeName: String(formData.get('collegeName') || ''),
                  collegeLoc: String(formData.get('collegeLoc') || ''),
                  department: String(formData.get('department') || ''),
                  yearOfStudy: String(formData.get('yearOfStudy') || ''),
                  registrationType: String(formData.get('registrationType') || 'GENERAL'),
                  amount: Number.isFinite(amount) ? amount : 0,
                  paymentChannel: String(formData.get('paymentChannel') || 'CASH'),
                  transactionId: String(formData.get('transactionId') || ''),
                  proofUrl: String(formData.get('proofUrl') || ''),
                  stationId: String(formData.get('stationId') || ''),
                  deviceId: String(formData.get('deviceId') || ''),
                  referralSource: String(formData.get('referralSource') || ''),
                  notes: String(formData.get('notes') || ''),
                });

                const state = result.success
                  ? 'On-spot user created. Verify payment to activate.'
                  : (result.error || 'Failed to create on-spot user.');
                redirect(`/admin/onspot-registration?tab=register&state=${encodeURIComponent(state)}`);
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              <input name="firstName" placeholder="First name" className="border rounded-lg px-3 py-2" required />
              <input name="lastName" placeholder="Last name" className="border rounded-lg px-3 py-2" required />
              <input name="email" type="email" placeholder="Email" className="border rounded-lg px-3 py-2" required />
              <input name="phone" placeholder="Phone" className="border rounded-lg px-3 py-2" required />
              <input name="password" type="password" placeholder="Set password" className="border rounded-lg px-3 py-2" required />
              <select name="registrationType" className="border rounded-lg px-3 py-2" defaultValue="GENERAL">
                <option value="GENERAL">GENERAL</option>
                <option value="WORKSHOP">WORKSHOP</option>
                <option value="COMBO">COMBO</option>
              </select>
              <input name="collegeName" placeholder="College" className="border rounded-lg px-3 py-2" required />
              <input name="collegeLoc" placeholder="College location" className="border rounded-lg px-3 py-2" required />
              <input name="department" placeholder="Department" className="border rounded-lg px-3 py-2" required />
              <input name="yearOfStudy" placeholder="Year of study" className="border rounded-lg px-3 py-2" required />
              <input name="amount" type="number" min="0" placeholder="Amount" className="border rounded-lg px-3 py-2" required />
              <select name="paymentChannel" className="border rounded-lg px-3 py-2" defaultValue="CASH">
                <option value="CASH">CASH</option>
                <option value="ONLINE">ONLINE</option>
              </select>
              <input name="transactionId" placeholder="Transaction reference (optional)" className="border rounded-lg px-3 py-2" />
              <input name="proofUrl" placeholder="Proof URL (optional)" className="border rounded-lg px-3 py-2" />
              <input name="stationId" placeholder="Station ID (optional)" className="border rounded-lg px-3 py-2" />
              <input name="deviceId" placeholder="Device ID (optional)" className="border rounded-lg px-3 py-2" />
              <input name="referralSource" placeholder="How did you hear about us? (optional)" className="border rounded-lg px-3 py-2 md:col-span-2" />
              <textarea name="notes" placeholder="Notes (optional)" className="border rounded-lg px-3 py-2 md:col-span-2 min-h-20" />
              <div className="md:col-span-2">
                <button className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">Create on-spot participant</button>
              </div>
            </form>
          </div>
        )}

        {(tab === 'verify' || tab === 'users') && (
          <div className="bg-white rounded-xl border p-6 space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=ALL&channel=${selectedChannel}&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedStatus === 'ALL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                ALL
              </a>
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=PENDING&channel=${selectedChannel}&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedStatus === 'PENDING' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                PENDING
              </a>
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=VERIFIED&channel=${selectedChannel}&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedStatus === 'VERIFIED' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                VERIFIED
              </a>
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=REJECTED&channel=${selectedChannel}&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedStatus === 'REJECTED' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                REJECTED
              </a>

              <div className="h-6 w-px bg-gray-200 mx-1" />

              <a
                href={`/admin/onspot-registration?tab=${tab}&status=${selectedStatus}&channel=ALL&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedChannel === 'ALL' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                ALL CHANNELS
              </a>
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=${selectedStatus}&channel=CASH&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedChannel === 'CASH' ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                CASH
              </a>
              <a
                href={`/admin/onspot-registration?tab=${tab}&status=${selectedStatus}&channel=ONLINE&q=${encodeURIComponent(search)}`}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${selectedChannel === 'ONLINE' ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-gray-600 border-gray-200'}`}
              >
                ONLINE
              </a>

              <form action="/admin/onspot-registration" className="ml-auto flex gap-2">
                <input type="hidden" name="tab" value={tab} />
                <input type="hidden" name="status" value={selectedStatus} />
                <input type="hidden" name="channel" value={selectedChannel} />
                <input name="q" defaultValue={search} placeholder="Search name/email/phone/ID" className="border rounded-lg px-3 py-1.5 text-sm" />
                <button className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm">Search</button>
              </form>
            </div>

            <div className="overflow-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-gray-700">
                  <tr>
                    <th className="text-left px-3 py-2">Participant</th>
                    <th className="text-left px-3 py-2">Payment</th>
                    <th className="text-left px-3 py-2">Shackles ID</th>
                    <th className="text-left px-3 py-2">Recent Events</th>
                    {showActionsColumn && <th className="text-left px-3 py-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {participants.length === 0 && (
                    <tr>
                      <td className="px-3 py-4 text-gray-500" colSpan={showActionsColumn ? 5 : 4}>No on-spot participants for selected filters.</td>
                    </tr>
                  )}
                  {participants.map((user) => (
                    <tr key={user.id} className="border-t align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        <p className="text-xs text-gray-500">{user.phone}</p>
                        <p className="text-xs text-gray-500">Created: {formatDate((user.onSpotProfile as { createdAt?: Date | null } | null)?.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs text-gray-600">{formatINR(user.payment?.amount ?? 0)}</p>
                        <p className="text-xs text-gray-600">{(user.payment as { paymentChannel?: string } | null)?.paymentChannel || '--'}</p>
                        <p className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                          user.payment?.status === 'VERIFIED'
                            ? 'bg-green-100 text-green-700'
                            : user.payment?.status === 'REJECTED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {user.payment?.status || '--'}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-mono text-xs text-gray-800">{user.shacklesId || '--'}</p>
                        <p className="text-xs text-gray-500">Role: {user.role}</p>
                      </td>
                      <td className="px-3 py-3">
                        {user.registrations.length === 0 ? (
                          <p className="text-xs text-gray-500">No registrations</p>
                        ) : (
                          <ul className="space-y-1">
                            {user.registrations.map((registration) => (
                              <li key={registration.id} className="text-xs text-gray-700">
                                {registration.event.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      {showActionsColumn && (
                        <td className="px-3 py-3 space-y-2 min-w-56">
                          {user.payment?.status === 'PENDING' && (
                            <>
                              <form
                                action={async (formData) => {
                                  'use server';
                                  const userId = String(formData.get('userId') || '');
                                  const note = String(formData.get('note') || '');
                                  const deviceId = String(formData.get('deviceId') || '');
                                  const result = await approveOnSpotPayment({ userId, note, deviceId });
                                  const state = result.success ? 'Payment verified.' : (result.error || 'Failed to verify payment.');
                                  redirect(`/admin/onspot-registration?tab=verify&state=${encodeURIComponent(state)}`);
                                }}
                                className="space-y-1"
                              >
                                <input type="hidden" name="userId" value={user.id} />
                                <input name="deviceId" placeholder="Device ID (optional)" className="w-full border rounded px-2 py-1 text-xs" />
                                <input name="note" placeholder="Verification note (optional)" className="w-full border rounded px-2 py-1 text-xs" />
                                <button className="w-full bg-green-600 text-white px-2 py-1.5 rounded text-xs font-semibold hover:bg-green-700">Verify Payment</button>
                              </form>

                              <form
                                action={async (formData) => {
                                  'use server';
                                  const userId = String(formData.get('userId') || '');
                                  const reason = String(formData.get('reason') || '');
                                  const result = await rejectOnSpotPayment({ userId, reason });
                                  const state = result.success ? 'Payment rejected.' : (result.error || 'Failed to reject payment.');
                                  redirect(`/admin/onspot-registration?tab=verify&state=${encodeURIComponent(state)}`);
                                }}
                                className="space-y-1"
                              >
                                <input type="hidden" name="userId" value={user.id} />
                                <input name="reason" placeholder="Rejection reason" className="w-full border rounded px-2 py-1 text-xs" />
                                <button className="w-full bg-red-600 text-white px-2 py-1.5 rounded text-xs font-semibold hover:bg-red-700">Reject Payment</button>
                              </form>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
