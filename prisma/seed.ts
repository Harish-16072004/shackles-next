import { Permission, PrismaClient, Role } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const activeYear = Number(process.env.ACTIVE_YEAR) || new Date().getUTCFullYear()
  const password = await hash('admin123', 10) // Default password

  const defaultRolePermissions: Array<{ role: Role; permissions: Permission[] }> = [
    {
      role: Role.ADMIN,
      permissions: [
        Permission.SCAN_ATTENDANCE,
        Permission.SCAN_KIT,
        Permission.ONSPOT_INDIVIDUAL_REG,
        Permission.ONSPOT_TEAM_REG,
        Permission.MANAGE_TEAMS,
        Permission.MANAGE_SCORES,
      ],
    },
    {
      role: Role.COORDINATOR,
      permissions: [
        Permission.SCAN_ATTENDANCE,
        Permission.SCAN_KIT,
        Permission.ONSPOT_INDIVIDUAL_REG,
        Permission.ONSPOT_TEAM_REG,
        Permission.MANAGE_TEAMS,
        Permission.MANAGE_SCORES,
      ],
    },
    {
      role: Role.VOLUNTEER,
      permissions: [
        Permission.SCAN_ATTENDANCE,
        Permission.SCAN_KIT,
        Permission.ONSPOT_INDIVIDUAL_REG,
        Permission.ONSPOT_TEAM_REG,
      ],
    },
  ]

  const admin = await prisma.user.upsert({
    where: { email: 'admin@shackles.com' },
    update: {},
    create: {
      email: 'admin@shackles.com',
      firstName: 'Super',
      lastName: 'Admin',
      phone: '0000000000',
      password,
      role: 'ADMIN',
      // Dummy data for required fields
      collegeName: 'ACGCET',
      collegeLoc: 'Karaikudi',
      department: 'Mechanical',
      yearOfStudy: 'IV'
    },
  })

  console.log({ admin })

  // --- SEED STAFF USERS ---
  const coordinator = await prisma.user.upsert({
    where: { email: 'coordinator@shackles.com' },
    update: {},
    create: {
      email: 'coordinator@shackles.com',
      firstName: 'Event',
      lastName: 'Coordinator',
      phone: '9876543210',
      password,
      role: 'COORDINATOR',
      collegeName: 'Staff',
      collegeLoc: 'Event',
      department: 'Operations',
      yearOfStudy: 'Staff',
    },
  })

  const volunteer = await prisma.user.upsert({
    where: { email: 'volunteer@shackles.com' },
    update: {},
    create: {
      email: 'volunteer@shackles.com',
      firstName: 'Event',
      lastName: 'Volunteer',
      phone: '9876543211',
      password,
      role: 'VOLUNTEER',
      collegeName: 'Staff',
      collegeLoc: 'Event',
      department: 'Operations',
      yearOfStudy: 'Staff',
    },
  })

  console.log('Staff users seeded:', { coordinator, volunteer })

  await prisma.rolePermission.deleteMany({
    where: {
      role: {
        in: defaultRolePermissions.map((item) => item.role),
      },
    },
  })

  await prisma.rolePermission.createMany({
    data: defaultRolePermissions.flatMap((item) =>
      item.permissions.map((permission) => ({ role: item.role, permission }))
    ),
    skipDuplicates: true,
  })

  console.log('Default role permissions seeded')

  // --- SEED EVENTS ---
  const events = [
    { name: "Paper Presentation", type: "TECHNICAL", category: 'EVENT' as const },
    { name: "Aqua Missile", type: "NON-TECHNICAL", category: 'EVENT' as const },
    { name: "CAD Modelling", type: "TECHNICAL", category: 'EVENT' as const },
    { name: "Treasure Hunt", type: "NON-TECHNICAL", category: 'EVENT' as const },
    { name: "Workshop: EV Tech", type: "TECHNICAL", category: 'WORKSHOP' as const, trainerName: 'Dr. Elon Volt' }
  ]

  for (const evt of events) {
    await prisma.event.upsert({
      where: { year_name: { year: activeYear, name: evt.name } },
      update: {
        type: evt.type,
        category: evt.category,
        trainerName: (evt as Record<string, unknown>).trainerName as string | undefined || null,
        isTemplate: true,
        isArchived: false,
        isActive: true, // Make active for easier testing
        templateSourceId: null,
      },
      create: {
        name: evt.name,
        year: activeYear,
        type: evt.type,
        category: evt.category,
        trainerName: (evt as Record<string, unknown>).trainerName as string | undefined || null,
        date: new Date(),
        isTemplate: true,
        isArchived: false,
        isActive: true,
        templateSourceId: null,
      },
    })
  }
  console.log("Template events seeded")

  // --- ASSIGN STAFF TO EVENTS ---
  const paperEvent = await prisma.event.findFirst({
    where: { year: activeYear, name: "Paper Presentation" },
  })

  const cadevent = await prisma.event.findFirst({
    where: { year: activeYear, name: "CAD Modelling" },
  })

  if (paperEvent) {
    await prisma.eventStaffAssignment.upsert({
      where: {
        eventId_userId_staffRole: {
          eventId: paperEvent.id,
          userId: coordinator.id,
          staffRole: 'COORDINATOR',
        },
      },
      update: {},
      create: {
        eventId: paperEvent.id,
        userId: coordinator.id,
        staffRole: 'COORDINATOR',
      },
    })

    await prisma.eventStaffAssignment.upsert({
      where: {
        eventId_userId_staffRole: {
          eventId: paperEvent.id,
          userId: volunteer.id,
          staffRole: 'VOLUNTEER',
        },
      },
      update: {},
      create: {
        eventId: paperEvent.id,
        userId: volunteer.id,
        staffRole: 'VOLUNTEER',
      },
    })

    console.log('Staff assigned to Paper Presentation event')
  }

  if (cadevent) {
    await prisma.eventStaffAssignment.upsert({
      where: {
        eventId_userId_staffRole: {
          eventId: cadevent.id,
          userId: coordinator.id,
          staffRole: 'COORDINATOR',
        },
      },
      update: {},
      create: {
        eventId: cadevent.id,
        userId: coordinator.id,
        staffRole: 'COORDINATOR',
      },
    })

    console.log('Coordinator assigned to CAD Modelling event')
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })