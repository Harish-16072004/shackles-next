import { getSession, getStaffAssignedEvents } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getActiveYear } from '@/lib/edition'
import Link from 'next/link'

export default async function CoordinatorDashboard() {
  const activeYear = getActiveYear()
  
  // Verify session
  const session = await getSession()
  if (!session?.userId) {
    redirect('/login')
  }

  // Verify user is a coordinator
  if (session.role !== 'COORDINATOR') {
    redirect('/')
  }

  // Get assigned events
  const assignedEvents = await getStaffAssignedEvents()

  // Get some stats for the dashboard
  const totalEventsAssigned = assignedEvents.length
  
  const totalParticipants = await Promise.all(
    assignedEvents.map(async (event) => {
      const count = await prisma.eventRegistration.count({
        where: { eventId: event.id },
      })
      return count
    })
  ).then(counts => counts.reduce((a, b) => a + b, 0))

  const totalAttended = await Promise.all(
    assignedEvents.map(async (event) => {
      const count = await prisma.eventRegistration.count({
        where: { eventId: event.id, attended: true },
      })
      return count
    })
  ).then(counts => counts.reduce((a, b) => a + b, 0))

  const totalTeams = await Promise.all(
    assignedEvents.map(async (event) => {
      const count = await prisma.team.count({
        where: { eventId: event.id },
      })
      return count
    })
  ).then(counts => counts.reduce((a, b) => a + b, 0))

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Coordinator Dashboard</h1>
          <p className="text-gray-600 mt-2">SHACKLES {activeYear}</p>
        </div>

        {/* User Info */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Profile</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Name</p>
              <p className="text-lg font-semibold text-gray-900">
                {session.displayName || session.email}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-lg font-semibold text-gray-900">{session.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Role</p>
              <p className="text-lg font-semibold text-purple-600">COORDINATOR</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Events Assigned</p>
              <p className="text-lg font-semibold text-gray-900">{totalEventsAssigned}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-purple-500">
            <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide mb-2">
              Events Assigned
            </h3>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{totalEventsAssigned}</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-green-500">
            <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide mb-2">
              Total Participants
            </h3>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{totalParticipants}</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-blue-500">
            <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide mb-2">
              Marked Attended
            </h3>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{totalAttended}</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border-l-4 border-orange-500">
            <h3 className="text-gray-600 font-semibold text-sm uppercase tracking-wide mb-2">
              Total Teams
            </h3>
            <p className="text-3xl sm:text-4xl font-bold text-gray-900">{totalTeams}</p>
          </div>
        </div>

        {/* Assigned Events with Scanner Links */}
        {assignedEvents.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Assigned Events</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {assignedEvents.map((event) => (
                <div key={event.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                  <p className="font-semibold text-gray-900 mb-1">{event.name}</p>
                  <p className="text-sm text-gray-600 mb-4">{new Date(event.date).toLocaleDateString()}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`/admin/scanner?eventId=${event.id}`}
                      className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                    >
                      Start Scanner
                    </Link>
                    <Link
                      href={`/admin/marking/allocate?eventId=${event.id}`}
                      className="inline-block bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
                    >
                      Allocate Marks
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        {assignedEvents.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Link
                href="/admin/events"
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-blue-50 transition"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Teams</h3>
                  <p className="text-sm text-gray-600">Oversee team registrations</p>
                </div>
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-2a6 6 0 0112 0v2zm0 0h6v-2a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </Link>

              <Link
                href="/admin/scanner/kit"
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-blue-50 transition"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">Distribute Kits</h3>
                  <p className="text-sm text-gray-600">Issue participant kits</p>
                </div>
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
