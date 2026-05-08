const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.event.findMany({
    select: { name: true, participationMode: true }
  });
  console.table(events);
}

main().finally(() => prisma.$disconnect());
