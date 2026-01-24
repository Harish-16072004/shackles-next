import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
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