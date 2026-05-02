import { PrismaClient, RegistrationType } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing existing users (except admin)...');
  // First, we can optionally clear users, but let's just add new ones to avoid deleting admins or existing data
  
  const usersToCreate = [];

  // Distribution:
  // WORKSHOP: 12
  // GENERAL: 13
  // COMBO: 25
  // Total: 50
  
  const types: RegistrationType[] = [
    ...Array(12).fill('WORKSHOP'),
    ...Array(13).fill('GENERAL'),
    ...Array(25).fill('COMBO')
  ];

  // Gender Distribution: 24 MALE, 24 FEMALE, 2 OTHER
  const genders = [
    ...Array(24).fill('MALE'),
    ...Array(24).fill('FEMALE'),
    ...Array(2).fill('OTHER')
  ];

  // Shuffle arrays for randomness
  const shuffle = (array: any[]) => array.sort(() => Math.random() - 0.5);
  shuffle(types);
  shuffle(genders);

  const passwordHash = await hash('password123', 10);

  console.log('Seeding 50 test users...');

  for (let i = 0; i < 50; i++) {
    const type = types[i];
    const gender = genders[i];
    
    // Amount logic (just for mock payment)
    let amount = 500;
    if (type === 'WORKSHOP') amount = 300;
    if (type === 'COMBO') amount = 800;

    const user = {
      firstName: `TestUser${i + 1}`,
      lastName: 'Smith',
      email: `testuser${i + 1}_${Date.now()}@example.com`,
      phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
      password: passwordHash,
      collegeName: 'Test College of Engineering',
      collegeLoc: 'Chennai',
      department: 'Computer Science',
      yearOfStudy: 'III',
      gender: gender,
      role: 'APPLICANT' as const,
      registrationType: type,
    };

    usersToCreate.push(user);
  }

  // Create users sequentially or in a transaction to create payments too
  for (const userData of usersToCreate) {
    let amount = 500;
    if (userData.registrationType === 'WORKSHOP') amount = 300;
    if (userData.registrationType === 'COMBO') amount = 800;

    await prisma.user.create({
      data: {
        ...userData,
        payment: {
          create: {
            amount,
            transactionId: `SEED-TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            status: 'VERIFIED',
            paymentChannel: 'ONLINE',
            captureSource: 'WEBSITE',
            proofUrl: 'https://example.com/mock-proof.jpg'
          }
        }
      }
    });
  }

  console.log('✅ Successfully seeded 50 test users with verified payments.');
  console.log(`- General (Event Only): 13`);
  console.log(`- Workshop Only: 12`);
  console.log(`- Combo (Both): 25`);
  console.log(`- Genders: 24 Male, 24 Female, 2 Other`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
