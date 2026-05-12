import 'server-only'
import { auth, signOut } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { Permission, Role } from '@prisma/client'

/**
 * Auth.js v5 compatible session wrapper
 * Provides backward-compatible interface for existing code
 */

export async function getSession() {
  const session = await auth()
  if (!session?.user) {
    return null
  }

  // Convert Auth.js session to legacy format
  const user = session.user
  return {
    userId: user.id,
    role: user.role || 'APPLICANT',
    displayName: user.name,
    email: user.email,
    user,
  }
}

export async function requireSession() {
  const session = await getSession()
  if (!session) {
    redirect('/login')
  }
  return session
}

export async function requireAdmin() {
  const session = await requireSession()
  const userRole = session?.role
  if (userRole !== 'ADMIN') {
    redirect('/')
  }
  return session
}

/**
 * Check if user is assigned to an event with a specific permission
 * Used for per-event staff authorization (VOLUNTEER/COORDINATOR)
 */
export async function requireEventStaff(eventId: string, permission?: Permission) {
  const session = await requireSession()
  const userRole = session?.role

  // ADMIN always has access
  if (userRole === 'ADMIN') {
    return session
  }

  // Only VOLUNTEER or COORDINATOR can be event staff
  if (userRole !== 'VOLUNTEER' && userRole !== 'COORDINATOR') {
    redirect('/')
  }

  // Check if user is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: userRole === 'COORDINATOR' ? 'COORDINATOR' : 'VOLUNTEER',
    },
    select: { id: true },
  })

  if (!assignment) {
    redirect('/staff/no-assignment')
  }

  // If permission specified, verify role has it
  if (permission) {
    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        role: userRole as Role,
        permission,
      },
      select: { role: true },
    })

    if (!rolePermission) {
      redirect('/staff/no-permission')
    }
  }

  return session
}

/**
 * Get all events assigned to the current staff user
 */
export async function getStaffAssignedEvents() {
  const session = await requireSession()
  const userRole = session?.role

  if (userRole !== 'VOLUNTEER' && userRole !== 'COORDINATOR') {
    return []
  }

  const assignments = await prisma.eventStaffAssignment.findMany({
    where: {
      userId: session.userId,
      staffRole: userRole === 'COORDINATOR' ? 'COORDINATOR' : 'VOLUNTEER',
    },
    include: {
      event: {
        select: {
          id: true,
          name: true,
          date: true,
          type: true,
          participationMode: true,
        },
      },
    },
  })

  return assignments.map(a => a.event)
}

/**
 * Create session via Auth.js signIn
 * @deprecated Auth.js handles session creation automatically after authorize()
 */
export async function createSession(_userId: string, _role: string, _displayName?: string) {
  throw new Error(
    "createSession() is deprecated. Auth.js handles session creation automatically after authorize()."
  );
}

/**
 * Non-redirecting event staff check for API routes
 * Returns allowed boolean instead of redirecting
 */
export async function checkEventStaff(
  eventId: string,
  permission?: Permission
): Promise<{ allowed: boolean; session?: Awaited<ReturnType<typeof getSession>>; error?: string }> {
  const session = await getSession()
  if (!session) {
    return { allowed: false, error: 'Not authenticated' }
  }

  const userRole = session.role

  // ADMIN always has access
  if (userRole === 'ADMIN') {
    return { allowed: true, session }
  }

  // Only VOLUNTEER or COORDINATOR can be event staff
  if (userRole !== 'VOLUNTEER' && userRole !== 'COORDINATOR') {
    return { allowed: false, error: 'Forbidden role' }
  }

  // Check if user is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: userRole === 'COORDINATOR' ? 'COORDINATOR' : 'VOLUNTEER',
    },
    select: { id: true },
  })

  if (!assignment) {
    return { allowed: false, error: 'Not assigned to this event' }
  }

  // If permission specified, verify role has it
  if (permission) {
    const rolePermission = await prisma.rolePermission.findFirst({
      where: {
        role: userRole as Role,
        permission,
      },
      select: { role: true },
    })

    if (!rolePermission) {
      return { allowed: false, error: `Missing permission: ${permission}` }
    }
  }

  return { allowed: true, session }
}

/**
 * Check if user can manage marking criteria for an event
 * Only SuperAdmin (ADMIN role) can manage criteria
 * Non-redirecting version for API routes
 */
export async function checkCanManageMarkingCriteria(
  eventId: string
): Promise<{ allowed: boolean; session?: Awaited<ReturnType<typeof getSession>>; error?: string }> {
  const session = await getSession()
  if (!session) {
    return { allowed: false, error: 'Not authenticated' }
  }

  // Only ADMIN can manage marking criteria
  if (session.role !== 'ADMIN') {
    return { allowed: false, error: 'Only SuperAdmin can manage marking criteria' }
  }

  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  })

  if (!event) {
    return { allowed: false, error: 'Event not found' }
  }

  return { allowed: true, session }
}

/**
 * Check if user can submit marks for an event
 * ADMIN can always submit; COORDINATOR only during their assigned events
 * Non-redirecting version for API routes
 */
export async function checkCanSubmitMarks(
  eventId: string
): Promise<{ allowed: boolean; session?: Awaited<ReturnType<typeof getSession>>; error?: string }> {
  const session = await getSession()
  if (!session) {
    return { allowed: false, error: 'Not authenticated' }
  }

  // ADMIN can always submit
  if (session.role === 'ADMIN') {
    return { allowed: true, session }
  }

  // Only COORDINATOR (and ADMIN, covered above) can submit marks
  if (session.role !== 'COORDINATOR') {
    return { allowed: false, error: 'Only coordinators and admins can submit marks' }
  }

  // Check if COORDINATOR is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: 'COORDINATOR',
    },
    select: { id: true },
  })

  if (!assignment) {
    return { allowed: false, error: 'Not assigned as coordinator to this event' }
  }

  return { allowed: true, session }
}

/**
 * Require SuperAdmin access for marking criteria management
 * Redirecting version for pages
 */
export async function requireMarkingCriteriaAccess(eventId: string) {
  const session = await requireSession()

  if (session.role !== 'ADMIN') {
    redirect('/')
  }

  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true },
  })

  if (!event) {
    redirect('/')
  }

  return session
}

/**
 * Require marking submission access for event
 * Redirecting version for pages
 */
export async function requireMarkSubmissionAccess(eventId: string) {
  const session = await requireSession()

  // ADMIN has access
  if (session.role === 'ADMIN') {
    return session
  }

  // Only COORDINATOR can submit in redirecting context
  if (session.role !== 'COORDINATOR') {
    redirect('/')
  }

  // Check if COORDINATOR is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: 'COORDINATOR',
    },
    select: { id: true },
  })

  if (!assignment) {
    redirect('/')
  }

  return session
}

/**
 * Check if user can manage registrations (add/delete members/teams, change leader) for an event
 * ADMIN can always manage; COORDINATOR only for their assigned events
 * Non-redirecting version for API routes
 */
export async function checkCanManageRegistrations(
  eventId: string
): Promise<{ allowed: boolean; session?: Awaited<ReturnType<typeof getSession>>; error?: string }> {
  const session = await getSession()
  if (!session) {
    return { allowed: false, error: 'Not authenticated' }
  }

  // ADMIN can always manage
  if (session.role === 'ADMIN') {
    return { allowed: true, session }
  }

  // Only COORDINATOR (and ADMIN, covered above) can manage
  if (session.role !== 'COORDINATOR') {
    return { allowed: false, error: 'Only coordinators and admins can manage registrations' }
  }

  // Check if COORDINATOR is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: 'COORDINATOR',
    },
    select: { id: true },
  })

  if (!assignment) {
    return { allowed: false, error: 'Not assigned as coordinator to this event' }
  }

  return { allowed: true, session }
}

/**
 * Require registration management access for event
 * Redirecting version for pages
 */
export async function requireManageRegistrationsAccess(eventId: string) {
  const session = await requireSession()

  // ADMIN has access
  if (session.role === 'ADMIN') {
    return session
  }

  // Only COORDINATOR can manage in redirecting context
  if (session.role !== 'COORDINATOR') {
    redirect('/')
  }

  // Check if COORDINATOR is assigned to this event
  const assignment = await prisma.eventStaffAssignment.findFirst({
    where: {
      eventId,
      userId: session.userId,
      staffRole: 'COORDINATOR',
    },
    select: { id: true },
  })

  if (!assignment) {
    redirect('/')
  }

  return session
}

/**
 * Delete session via Auth.js signOut
 */
export async function deleteSession() {
  await signOut({ redirect: false })
}