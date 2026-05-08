const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Starting database cleanup...");

  // Delete transactional data
  await prisma.registrationOperation.deleteMany();
  await prisma.eventRegistration.deleteMany();
  await prisma.teamInvite.deleteMany();
  await prisma.team.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.onSpotProfile.deleteMany();
  await prisma.accommodation.deleteMany();
  await prisma.contactMessage.deleteMany();
  await prisma.eventStaffAssignment.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.shacklesIdSequence.deleteMany();

  // Delete non-admin users
  const result = await prisma.user.deleteMany({
    where: {
      role: {
        not: 'ADMIN'
      }
    }
  });

  console.log(`Successfully cleared database. Deleted ${result.count} non-admin users.`);
}

main()
  .catch(e => {
    console.error("Error during cleanup:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
