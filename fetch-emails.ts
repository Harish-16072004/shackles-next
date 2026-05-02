import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({ 
    where: { email: { startsWith: 'testuser' } }, 
    select: { email: true, registrationType: true, gender: true },
    take: 10 
  });
  console.log(JSON.stringify(users, null, 2));
}
main().finally(() => prisma.$disconnect());
