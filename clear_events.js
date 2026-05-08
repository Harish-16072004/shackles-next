const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Clearing all events...");
  
  // Since we already deleted registrations, teams, etc., we can just delete the events directly.
  // We should also delete EventStaffAssignment if any are left.
  await prisma.eventStaffAssignment.deleteMany();
  
  const result = await prisma.event.deleteMany();

  console.log(`Successfully deleted ${result.count} events.`);
}

main()
  .catch(e => {
    console.error("Error during cleanup:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
