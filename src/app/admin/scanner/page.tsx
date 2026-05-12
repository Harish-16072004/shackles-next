import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import ScannerWidget from '@/components/features/ScannerWidget'
import EventAttendanceScanner from '@/components/features/EventAttendanceScanner'

export default async function AdminScannerPage(props: {
  searchParams: Promise<{ eventId?: string }>
}) {
  const searchParams = await props.searchParams
  const session = await getSession()
  if (!session?.userId) {
    redirect('/login')
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: { role: true },
  })

  if (!currentUser || (currentUser.role !== 'ADMIN' && currentUser.role !== 'COORDINATOR' && currentUser.role !== 'VOLUNTEER')) {
    redirect('/login')
  }

  const eventId = searchParams.eventId

  // If eventId is provided, render event-specific scanner
  if (eventId) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, type: true, teamMinSize: true, teamMaxSize: true },
    })

    if (!event) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 text-center">
            <p className="text-red-600 font-semibold">Event not found</p>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <EventAttendanceScanner eventId={eventId} eventName={event.name} isAdmin={currentUser.role === 'ADMIN'} />
      </div>
    )
  }

  // No eventId - only allow admin for generic scanner
  if (currentUser.role !== 'ADMIN') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full mb-8">
        <h1 className="text-3xl font-bold text-gray-900 text-center mb-2">Event Scanner</h1>
        <p className="text-gray-500 text-center mb-8">Scan participant QR codes to mark attendance or issue kits.</p>
        <ScannerWidget />
      </div>
    </div>
  )
}
