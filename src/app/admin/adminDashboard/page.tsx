'use server'

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";
import { getActiveYear } from "@/lib/edition";

export default async function AdminDashboard() {
  const activeYear = getActiveYear();
  // Get session
  const session = await getSession();
  if (!session || !session.userId) {
    redirect('/login');
  }

  // Fetch user data
  const user = await prisma.user.findUnique({
    where: { id: session.userId as string },
    include: {
      payment: true,
      accommodation: true,
    }
  });

  if (!user) {
    redirect('/login');
  }

  // Fetch dashboard statistics
  const [
    totalRegistrations,
    verifiedPayments,
    pendingPayments,
    generalOnly,
    workshopOnly,
    bothTypes,
    kitsIssued,
    totalAccommodations,
    maleAccommodations,
    femaleAccommodations,
    events,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.payment.count({ where: { status: 'VERIFIED' } }),
    prisma.payment.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { registrationType: 'GENERAL' } }),
    prisma.user.count({ where: { registrationType: 'WORKSHOP' } }),
    prisma.user.count({ where: { registrationType: 'COMBO' } }),
    prisma.user.count({ where: { kitStatus: 'ISSUED' } }),
    prisma.accommodation.count(),
    prisma.accommodation.count({ where: { gender: 'MALE' } }),
    prisma.accommodation.count({ where: { gender: 'FEMALE' } }),
    prisma.event.findMany({
      orderBy: { name: 'asc' },
      include: {
        registrations: {
          select: {
            teamSize: true,
          },
        },
      }
    }).catch(() => []),
  ]);

  const workshopEvents = events.filter((event) => event.name.toLowerCase().includes('workshop'));
  const technicalEvents = events.filter((event) => {
    const type = (event.type || '').toUpperCase();
    return type === 'TECHNICAL' && !event.name.toLowerCase().includes('workshop');
  });
  const nonTechnicalEvents = events.filter((event) => {
    const type = (event.type || '').toUpperCase();
    return type === 'NON-TECHNICAL' && !event.name.toLowerCase().includes('workshop');
  });
  const specialEvents = events.filter((event) => {
    const type = (event.type || '').toUpperCase();
    return type === 'SPECIAL' && !event.name.toLowerCase().includes('workshop');
  });
  const registrationsPerEvent = events.map((event) =>
    event.registrations.reduce((sum, registration) => sum + (registration.teamSize || 1), 0)
  );
  const maxRegistrations = Math.max(1, ...registrationsPerEvent);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <LiveSyncRefresher intervalMs={12000} />
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">SHACKLES {activeYear} Statistics & Management</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Total Registrations */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-cyan-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Total Registrations</h3>
              <div className="bg-cyan-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"></path>
                </svg>
              </div>
            </div>
            <p className="text-4xl font-bold text-gray-900">{totalRegistrations}</p>
          </div>

          {/* Verified Payments */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Verified Payments</h3>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
            <p className="text-4xl font-bold text-gray-900">{verifiedPayments}</p>
          </div>

          {/* Pending Payments */}
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Pending Payments Verification</h3>
              <div className="bg-orange-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd"></path>
                </svg>
              </div>
            </div>
            <p className="text-4xl font-bold text-gray-900">{pendingPayments}</p>
          </div>
        </div>

        {/* Pass Mix Cards */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Registration Types</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* General Only */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">General Only</h3>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v2h8v-2zM16 11a2 2 0 100-4 2 2 0 000 4z"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{generalOnly}</p>
            </div>

            {/* Workshop Only */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Workshop Only</h3>
                <div className="bg-yellow-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{workshopOnly}</p>
            </div>

            {/* Both */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-pink-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Combo (Both)</h3>
                <div className="bg-pink-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-pink-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" clipRule="evenodd"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{bothTypes}</p>
            </div>
          </div>
        </div>

        {/* Logistics Cards */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Logistics & Kit Distribution</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Kits Issued */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-teal-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Kits Issued</h3>
                <div className="bg-teal-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4V5h12v10z"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{kitsIssued}</p>
            </div>

            {/* Total Accommodations */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Total Accommodations</h3>
                <div className="bg-indigo-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{totalAccommodations}</p>
            </div>

            {/* Male Accommodations */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Male</h3>
                <div className="bg-blue-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{maleAccommodations}</p>
            </div>

            {/* Female Accommodations */}
            <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-pink-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide">Female</h3>
                <div className="bg-pink-100 p-3 rounded-lg">
                  <svg className="w-6 h-6 text-pink-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 1a4.5 4.5 0 110 9A4.5 4.5 0 0110 1zM2 19.5A5.5 5.5 0 1118 19.5H2z"></path>
                  </svg>
                </div>
              </div>
              <p className="text-4xl font-bold text-gray-900">{femaleAccommodations}</p>
            </div>


          </div>
        </div>

        {/* Quick Actions Section */}
        <div className="mt-12">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Manage Users */}
            <a href="/admin/users" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.5 1.5H5.75A2.25 2.25 0 003.5 3.75v12.5A2.25 2.25 0 005.75 18.5h8.5a2.25 2.25 0 002.25-2.25V6.75M10.5 1.5v5.25m0 0H6M10.5 6.75h4.5"></path>
                  <path d="M7 11h6M7 14h6"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Manage Users</p>
            </a>

            {/* Manage Events */}
            <a href="/admin/events" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v2h16V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h12a1 1 0 100-2H6z" clipRule="evenodd"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Manage Events</p>
            </a>

            {/* View Registrations */}
            <a href="/admin/event-registrations" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-green-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">View Registrations</p>
            </a>

            {/* Verify Payments */}
            <a href="/admin/payments" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-orange-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a1 1 0 100-2 1 1 0 000 2z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Verify Payments</p>
            </a>

            {/* On-Spot Console */}
            <a href="/admin/onspot-registration" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-emerald-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-emerald-700" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a6 6 0 00-6 6v2H3a1 1 0 000 2h14a1 1 0 100-2h-1V8a6 6 0 00-6-6zm-3 8V8a3 3 0 116 0v2H7zm-1 3a1 1 0 011-1h6a1 1 0 011 1v2H6v-2z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">On-Spot Console</p>
            </a>

            {/* Accommodations */}
            <a href="/admin/accommodations" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-pink-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-pink-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Accommodations</p>
            </a>

            {/* Contact Messages */}
            <a href="/admin/audit-logs" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-indigo-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"></path>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Contact Messages</p>
            </a>

            {/* QR Scanner */}
            <a href="/admin/scanner-v2" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-cyan-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h3a1 1 0 011 1v3a1 1 0 11-2 0V5H4a1 1 0 01-1-1zm11-1a1 1 0 100 2h1v2a1 1 0 102 0V4a1 1 0 00-1-1h-2zM3 14a1 1 0 00-1 1v2a1 1 0 001 1h2a1 1 0 100-2H4v-1a1 1 0 00-1-1zm14 0a1 1 0 00-1 1v1h-1a1 1 0 100 2h2a1 1 0 001-1v-2a1 1 0 00-1-1z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">QR Scanner</p>
            </a>

            {/* Kit Distribution */}
            <a href="/admin/users?kit=ISSUED" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-red-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M4 4a2 2 0 012-2h4l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Kit Distribution</p>
            </a>

            {/* ID Card Generator */}
            <a href="/admin/id-cards" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-rose-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="10" r="2" />
                  <path d="M15 8h2M15 12h2M6 16h12" strokeLinecap="round" />
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">ID Card Generator</p>
            </a>

            {/* Audit Logs */}
            <a href="/admin/audit-logs" className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow text-center">
              <div className="bg-gray-100 w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1h5a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h5V3a1 1 0 011-1zm-4 7a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 000 2h5a1 1 0 100-2H6z" clipRule="evenodd"></path>
                </svg>
              </div>
              <p className="text-gray-900 font-semibold text-sm">Audit Logs</p>
            </a>
          </div>
        </div>

        {/* Event-wise Registrations */}
        <div className="mt-12">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Event-wise Registrations</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">Technical Events</h3>
              <div className="space-y-4">
                {technicalEvents.length === 0 && (
                  <p className="text-gray-500 text-sm">No technical events found.</p>
                )}
                {technicalEvents.map((event) => {
                  const count = event.registrations.reduce((sum, registration) => sum + (registration.teamSize || 1), 0);
                  const width = Math.round((count / maxRegistrations) * 100);
                  return (
                    <div key={event.id} className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-gray-700 truncate">{event.name}</div>
                      <div className="flex-1">
                        <div className="h-3 bg-gray-100 rounded-full">
                          <div className="h-3 bg-blue-500 rounded-full" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-gray-900">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">Non-Technical Events</h3>
              <div className="space-y-4">
                {nonTechnicalEvents.length === 0 && (
                  <p className="text-gray-500 text-sm">No non-technical events found.</p>
                )}
                {nonTechnicalEvents.map((event) => {
                  const count = event.registrations.reduce((sum, registration) => sum + (registration.teamSize || 1), 0);
                  const width = Math.round((count / maxRegistrations) * 100);
                  return (
                    <div key={event.id} className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-gray-700 truncate">{event.name}</div>
                      <div className="flex-1">
                        <div className="h-3 bg-gray-100 rounded-full">
                          <div className="h-3 bg-blue-500 rounded-full" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-gray-900">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">Special Events</h3>
              <div className="space-y-4">
                {specialEvents.length === 0 && (
                  <p className="text-gray-500 text-sm">No special events found.</p>
                )}
                {specialEvents.map((event) => {
                  const count = event.registrations.reduce((sum, registration) => sum + (registration.teamSize || 1), 0);
                  const width = Math.round((count / maxRegistrations) * 100);
                  return (
                    <div key={event.id} className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-gray-700 truncate">{event.name}</div>
                      <div className="flex-1">
                        <div className="h-3 bg-gray-100 rounded-full">
                          <div className="h-3 bg-blue-500 rounded-full" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-gray-900">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-md font-bold text-gray-900 mb-4">Workshops</h3>
              <div className="space-y-4">
                {workshopEvents.length === 0 && (
                  <p className="text-gray-500 text-sm">No workshops found.</p>
                )}
                {workshopEvents.map((event) => {
                  const count = event.registrations.reduce((sum, registration) => sum + (registration.teamSize || 1), 0);
                  const width = Math.round((count / maxRegistrations) * 100);
                  return (
                    <div key={event.id} className="flex items-center gap-4">
                      <div className="w-48 text-sm font-medium text-gray-700 truncate">{event.name}</div>
                      <div className="flex-1">
                        <div className="h-3 bg-gray-100 rounded-full">
                          <div className="h-3 bg-blue-500 rounded-full" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                      <div className="w-12 text-right text-sm font-semibold text-gray-900">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
