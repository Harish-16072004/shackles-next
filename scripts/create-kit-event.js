const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const year = 2026;
  const existing = await p.event.findFirst({ where: { name: 'KIT DISTRIBUTION', year } });
  if (existing) {
    console.log('Already exists:', existing.id);
  } else {
    const e = await p.event.create({
      data: {
        name: 'KIT DISTRIBUTION',
        year,
        type: 'SPECIAL',
        category: 'EVENT',
        participationMode: 'INDIVIDUAL',
        isActive: true,
        isArchived: false,
        coordinatorName: 'Admin',
        coordinatorPhone: '+910000000000',
      },
    });
    console.log('Created KIT DISTRIBUTION event:', e.id);
  }
  await p.$disconnect();
}

main().catch(console.error);
