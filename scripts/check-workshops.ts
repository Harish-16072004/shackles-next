import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.event.groupBy({
    by: ['category'],
    _count: true
  });
  console.log(JSON.stringify(counts, null, 2));

  const workshops = await prisma.event.findMany({
    where: { category: 'WORKSHOP' }
  });
  console.log('Workshops found:', workshops.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
