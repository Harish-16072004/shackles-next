import AllocateMarks from '@/components/features/AllocateMarks'
import { requireSession, requireEventStaff } from '@/lib/session'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function AllocateMarksPage({ searchParams }: { searchParams: Promise<{ eventId?: string }> }) {
  const session = await requireSession()
  const isAdmin = session.role === 'ADMIN'

  const resolvedSearchParams = await searchParams
  const eventId = resolvedSearchParams.eventId
  if (!eventId) {
    redirect('/admin/events')
  }

  if (!isAdmin) {
    await requireEventStaff(eventId, 'MANAGE_SCORES')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Allocate Marks</h1>
            <p className="text-gray-600 mt-1">Input individual judge marks for each team/participant.</p>
          </div>
          <Link href={isAdmin ? "/admin/events" : "/staff/coordinatorDashboard"} className="text-blue-600 font-semibold hover:underline">
            Back to Dashboard
          </Link>
        </div>
        
        <AllocateMarks eventId={eventId} />
      </div>
    </div>
  )
}
