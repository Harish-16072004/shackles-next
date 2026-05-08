const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.event.updateMany({
    where: { name: 'ROBO RUMBLE' },
    data: { participationMode: 'TEAM', teamMinSize: 2, teamMaxSize: 4 }
  });
  console.log('Updated ROBO RUMBLE to TEAM mode');
}

main().finally(() => prisma.$disconnect());
