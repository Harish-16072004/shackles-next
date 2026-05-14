'use server'

import { z } from 'zod'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { Role, StaffRole } from '@prisma/client'
import { logAdminAudit } from '@/lib/admin-audit'
import { executeSafeAction } from '@/lib/safe-action'
import { Permission } from '@prisma/client'

import { indianPhoneSchema } from '@/lib/validation/phone'

// ===== Validation Schemas =====

const CreateStaffUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name required'),
  lastName: z.string().min(1, 'Last name required'),
  phone: indianPhoneSchema,
  role: z.enum(['COORDINATOR', 'VOLUNTEER'], {
    message: 'Role must be COORDINATOR or VOLUNTEER',
  }),
})

const AssignStaffToEventSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  eventId: z.string().cuid('Invalid event ID'),
  staffRole: z.enum(['COORDINATOR', 'VOLUNTEER']).optional(),
})

const RemoveStaffFromEventSchema = z.object({
  userId: z.string().cuid('Invalid user ID'),
  eventId: z.string().cuid('Invalid event ID'),
})

// ===== Staff Creation =====

export async function createStaffUser(input: z.infer<typeof CreateStaffUserSchema>) {
  return executeSafeAction({ roles: [Role.ADMIN] }, async (session) => {
    // Validate input
    const validated = CreateStaffUserSchema.parse(input)

    const { email, password, firstName, lastName, phone, role } = validated

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingUser) {
      throw new Error('Email already in use')
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
      staff: staffUser,
      message: `${role} account created successfully`,
    }
  })
}

// ===== Event Assignment =====

export async function assignStaffToEvent(input: z.infer<typeof AssignStaffToEventSchema>) {
  return executeSafeAction({ roles: [Role.ADMIN] }, async (session) => {
    // Validate input
    const validated = AssignStaffToEventSchema.parse(input)

    const { userId, eventId, staffRole: providedRole } = validated

    // Verify user exists and is staff
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })

    if (!user) {
      throw new Error('User not found')
    }

    if (user.role !== 'COORDINATOR' && user.role !== 'VOLUNTEER') {
      throw new Error('User is not a staff member')
    }

    // Use user's primary role if not explicitly provided (derived from database)
    const staffRole = providedRole || (user.role as unknown as StaffRole)

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    })

    if (!event) {
      throw new Error('Event not found')
    }

    // Check if already assigned
    const existing = await prisma.eventStaffAssignment.findFirst({
      where: {
        userId,
        eventId,
      },
    })

    if (existing) {
      throw new Error('Staff already assigned to this event')
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
      assignment: {
        ...assignment,
        eventName: event.name,
      },
      message: `${user.email} assigned to ${event.name} as ${staffRole}`,
    }
  })
}

// ===== Remove Assignment =====

export async function removeStaffFromEvent(input: z.infer<typeof RemoveStaffFromEventSchema>) {
  return executeSafeAction({ roles: [Role.ADMIN] }, async (session) => {
    // Validate input
    const validated = RemoveStaffFromEventSchema.parse(input)

    const { userId, eventId } = validated

    // Verify assignment exists
    const assignment = await prisma.eventStaffAssignment.findFirst({
      where: { userId, eventId },
      include: {
        user: { select: { email: true } },
        event: { select: { name: true } },
      },
    })

    if (!assignment) {
      throw new Error('Assignment not found')
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
      message: `${assignment.user.email} removed from ${assignment.event.name}`,
    }
  })
}

// ===== List Functions =====

export async function listStaffUsers() {
  return executeSafeAction({ roles: [Role.ADMIN] }, async (session) => {
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

    return { staff }
  })
}

export async function listAvailableEvents() {
  return executeSafeAction({ roles: [Role.ADMIN] }, async (session) => {
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

    return { events }
  })
}
