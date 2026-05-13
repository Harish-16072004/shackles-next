import { getSession, getStaffAssignedEvents } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getActiveYear } from '@/lib/edition'
import Link from 'next/link'
import { StaffEventCard } from '@/components/features/StaffEventCard'

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

  // Optimized stats fetching: Use groupBy to avoid N+1 queries
  const eventIds = assignedEvents.map(e => e.id)
  
  const [participantStats, teamStats] = await Promise.all([
    prisma.eventRegistration.groupBy({
      by: ['attended'],
      where: { eventId: { in: eventIds } },
      _count: true
    }),
    prisma.team.count({
      where: { eventId: { in: eventIds } }
    })
  ])

  const totalParticipants = participantStats.reduce((sum, s) => sum + s._count, 0)
  const totalAttended = participantStats.find(s => s.attended)?._count || 0
  const totalTeams = teamStats

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="w-full mx-auto px-4">
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

          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
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

        {/* Assigned Events with Management Controls */}
        {assignedEvents.length > 0 && (
          <div className="grid grid-cols-1 gap-6">
            {assignedEvents.map((event: any) => (
              <StaffEventCard key={event.id} event={event} />
            ))}
          </div>

        )}


      </div>
    </div >
  )
}
