
import { PrismaClient, TeamStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateLegacyEnums() {
  console.log('Starting migration of legacy TeamStatus enums...');

  // 1. DRAFT -> OPEN
  const draftCount = await prisma.team.updateMany({
    where: { status: 'DRAFT' as any },
    data: { status: 'OPEN' },
  });
  console.log(`Migrated ${draftCount.count} teams from DRAFT to OPEN.`);

  // 2. COMPLETED -> LOCKED
  const completedCount = await prisma.team.updateMany({
    where: { status: 'COMPLETED' as any },
    data: { status: 'LOCKED' },
  });
  console.log(`Migrated ${completedCount.count} teams from COMPLETED to LOCKED.`);

  console.log('Migration complete.');
}

migrateLegacyEnums()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
