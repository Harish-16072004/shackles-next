import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const activeYear = Number(process.env.ACTIVE_YEAR) || new Date().getUTCFullYear()
  const password = await hash('admin123', 10) // Default password

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

  // --- SEED EVENTS ---
  const events = [
    { name: "Paper Presentation", type: "TECHNICAL" },
    { name: "Aqua Missile", type: "NON-TECHNICAL" },
    { name: "CAD Modelling", type: "TECHNICAL" },
    { name: "Treasure Hunt", type: "NON-TECHNICAL" },
    { name: "Workshop: EV Tech", type: "TECHNICAL" }
  ]

  for (const evt of events) {
    await prisma.event.upsert({
      where: { year_name: { year: activeYear, name: evt.name } },
      update: {
        type: evt.type,
        isTemplate: true,
        isArchived: false,
        isActive: false,
        templateSourceId: null,
      },
      create: {
        name: evt.name,
        year: activeYear,
        type: evt.type,
        date: new Date(),
        isTemplate: true,
        isArchived: false,
        isActive: false,
        templateSourceId: null,
      },
    })
  }
  console.log("Template events seeded")
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