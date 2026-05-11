'use server'

import { z } from 'zod'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { Role, StaffRole } from '@prisma/client'
import { logAdminAudit } from '@/lib/admin-audit'

// ===== Validation Schemas =====

const CreateStaffUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  phone: z.string().min(10, 'Valid phone number required'),
  role: z.enum(['COORDINATOR', 'VOLUNTEER'], {
    errorMap: () => ({ message: 'Role must be COORDINATOR or VOLUNTEER' }),
  }),
})

const AssignStaffToEventSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  eventId: z.string().cuid('Invalid event ID'),
  staffRole: z.enum(['COORDINATOR', 'VOLUNTEER']),
})

const RemoveStaffFromEventSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  eventId: z.string().cuid('Invalid event ID'),
})

// ===== Staff Creation =====

export async function createStaffUser(input: z.infer<typeof CreateStaffUserSchema>) {
  try {
    // Verify admin
    const session = await requireAdmin()

    // Validate input
    const result = CreateStaffUserSchema.safeParse(input)
    if (!result.success) {
      return {
        success: false,
        error: result.error.flatten().fieldErrors,
      }
    }

    const { email, password, firstName, lastName, phone, role } = result.data

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingUser) {
      return {
        success: false,
        error: { email: ['Email already in use'] },
      }
    }

    // Hash password
    const hashedPassword = await hash(password, 10)

    // Create user with staff role
    const staffUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: role as Role,
        // Required fields (use defaults for staff accounts)
        collegeName: 'Staff',
        collegeLoc: 'Event',
        department: 'Operations',
        yearOfStudy: 'Staff',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    })

    // Log audit
    await logAdminAudit({
      action: 'CREATE_STAFF_USER',
      target: staffUser.id,
      details: { message: `Created ${role} user: ${email}` },
      actorId: session.userId,
    })

    return {
      success: true,
      data: staffUser,
      message: `${role} account created successfully`,
    }
  } catch (error) {
    console.error('[createStaffUser] Error:', error)
    return {
      success: false,
      error: {
        general: ['Failed to create staff user'],
      },
    }
  }
}

// ===== Event Assignment =====

export async function assignStaffToEvent(input: z.infer<typeof AssignStaffToEventSchema>) {
  try {
    // Verify admin
    const session = await requireAdmin()

    // Validate input
    const result = AssignStaffToEventSchema.safeParse(input)
    if (!result.success) {
      return {
        success: false,
        error: 'Invalid input',
      }
    }

    const { userId, eventId, staffRole } = result.data

    // Verify user exists and is staff
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    if (user.role !== 'COORDINATOR' && user.role !== 'VOLUNTEER') {
      return { success: false, error: 'User is not a staff member' }
    }

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    })

    if (!event) {
      return { success: false, error: 'Event not found' }
    }

    // Check if already assigned
    const existing = await prisma.eventStaffAssignment.findFirst({
      where: {
        userId,
        eventId,
        staffRole,
      },
    })

    if (existing) {
      return { success: false, error: 'Staff already assigned to this event with this role' }
    }

    // Create assignment
    const assignment = await prisma.eventStaffAssignment.create({
      data: {
        userId,
        eventId,
        staffRole: staffRole as StaffRole,
      },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        event: { select: { name: true } },
      },
    })

    // Log audit
    await logAdminAudit({
      action: 'ASSIGN_STAFF_TO_EVENT',
      target: assignment.id,
      details: { message: `Assigned ${user.email} as ${staffRole} to event ${event.name}` },
      actorId: session.userId,
    })

    return {
      success: true,
      data: assignment,
      message: `${user.email} assigned to ${event.name} as ${staffRole}`,
    }
  } catch (error) {
    console.error('[assignStaffToEvent] Error:', error)
    return {
      success: false,
      error: 'Failed to assign staff to event',
    }
  }
}

// ===== Remove Assignment =====

export async function removeStaffFromEvent(input: z.infer<typeof RemoveStaffFromEventSchema>) {
  try {
    // Verify admin
    const session = await requireAdmin()

    // Validate input
    const result = RemoveStaffFromEventSchema.safeParse(input)
    if (!result.success) {
      return { success: false, error: 'Invalid input' }
    }

    const { userId, eventId } = result.data

    // Verify assignment exists
    const assignment = await prisma.eventStaffAssignment.findFirst({
      where: { userId, eventId },
      include: {
        user: { select: { email: true } },
        event: { select: { name: true } },
      },
    })

    if (!assignment) {
      return { success: false, error: 'Assignment not found' }
    }

    // Delete assignment
    await prisma.eventStaffAssignment.deleteMany({
      where: { userId, eventId },
    })

    // Log audit
    await logAdminAudit({
      action: 'REMOVE_STAFF_FROM_EVENT',
      target: userId,
      details: { message: `Removed ${assignment.user.email} from event: ${assignment.event.name}` },
      actorId: session.userId,
    })

    return {
      success: true,
      message: `${assignment.user.email} removed from ${assignment.event.name}`,
    }
  } catch (error) {
    console.error('[removeStaffFromEvent] Error:', error)
    return {
      success: false,
      error: 'Failed to remove staff from event',
    }
  }
}

// ===== List Functions =====

export async function listStaffUsers() {
  try {
    await requireAdmin()

    const staff = await prisma.user.findMany({
      where: {
        role: { in: ['COORDINATOR', 'VOLUNTEER'] },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        staffAssignments: {
          include: {
            event: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return { success: true, data: staff }
  } catch (error) {
    console.error('[listStaffUsers] Error:', error)
    return { success: false, error: 'Failed to list staff users' }
  }
}

export async function listAvailableEvents() {
  try {
    await requireAdmin()

    const events = await prisma.event.findMany({
      where: {
        isActive: true,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        date: true,
        type: true,
      },
      orderBy: { date: 'asc' },
    })

    return { success: true, data: events }
  } catch (error) {
    console.error('[listAvailableEvents] Error:', error)
    return { success: false, error: 'Failed to list events' }
  }
}
