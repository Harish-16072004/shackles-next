import { PrismaClient, EventParticipationMode } from "@prisma/client";
import { runSerializableTransaction } from "../src/server/services/transaction.service";
import { quickRegisterAndMarkAttendance } from "../src/server/services/event-registration.service";
import { bulkRegisterAndLockTeamByShacklesIds } from "../src/server/services/team-registration.service";

const prisma = new PrismaClient();

function runTag() {
  return `phase5-lat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

async function createVerifiedUser(tag: string, index: number) {
  const suffix = `${tag}-${index}`;
  const user = await prisma.user.create({
    data: {
      firstName: `Latency${index}`,
      lastName: "Baseline",
      email: `lat.${suffix}@example.test`,
      phone: `822${String(index).padStart(7, "0")}`,
      password: "phase5-latency",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: `LAT${Date.now()}${String(index).padStart(3, "0")}`,
    },
  });

  await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `lat-tx-${suffix}`,
      proofUrl: `lat-proof-${suffix}`,
      status: "VERIFIED",
    },
  });

  return user;
}

async function main() {
  const tag = runTag();
  const quickRegisterDurations: number[] = [];
  const teamCompleteDurations: number[] = [];

  const quickEvent = await prisma.event.create({
    data: {
      name: `PHASE5-LAT-IND-${tag}`,
      type: "TECHNICAL",
      participationMode: EventParticipationMode.INDIVIDUAL,
      maxParticipants: 500,
      maxTeams: 500,
      isActive: true,
      date: new Date(),
    },
  });

  const teamEvent = await prisma.event.create({
    data: {
      name: `PHASE5-LAT-TEAM-${tag}`,
      type: "TECHNICAL",
      participationMode: EventParticipationMode.TEAM,
      teamMinSize: 2,
      teamMaxSize: 4,
      maxParticipants: 500,
      maxTeams: 500,
      isActive: true,
      date: new Date(),
    },
  });

  try {
    const quickUsers = await Promise.all(Array.from({ length: 20 }).map((_, i) => createVerifiedUser(tag, i + 1)));

    for (const [index, user] of quickUsers.entries()) {
      const startedAt = Date.now();
      const result = await runSerializableTransaction(prisma, (tx) =>
        quickRegisterAndMarkAttendance({
          db: tx,
          userId: user.id,
          eventName: quickEvent.name,
          stationId: `${tag}-quick-station`,
          clientOperationId: `${tag}-quick-op-${index}`,
          syncedAt: new Date(),
        })
      );
      quickRegisterDurations.push(Date.now() - startedAt);

      if (!result.success) {
        throw new Error(`Quick register baseline failed: ${result.reason}`);
      }
    }

    for (let round = 0; round < 12; round += 1) {
      const teamUsers = await Promise.all([
        createVerifiedUser(tag, 1000 + round * 2 + 1),
        createVerifiedUser(tag, 1000 + round * 2 + 2),
      ]);

      const shacklesIds = teamUsers
        .map((user) => user.shacklesId)
        .filter((value): value is string => Boolean(value));

      const startedAt = Date.now();
      const result = await runSerializableTransaction(prisma, (tx) =>
        bulkRegisterAndLockTeamByShacklesIds({
          db: tx,
          eventName: teamEvent.name,
          teamName: `PHASE5 LAT TEAM ${tag} ${round}`,
          shacklesIds,
          leaderShacklesId: shacklesIds[0],
          stationId: `${tag}-team-station`,
          operationId: `${tag}-team-op-${round}`,
          syncedAt: new Date(),
        })
      );
      teamCompleteDurations.push(Date.now() - startedAt);

      if (!result.success) {
        throw new Error(`Team complete baseline failed: ${result.reason}`);
      }
    }

    const quickP50 = percentile(quickRegisterDurations, 50);
    const quickP95 = percentile(quickRegisterDurations, 95);
    const teamP50 = percentile(teamCompleteDurations, 50);
    const teamP95 = percentile(teamCompleteDurations, 95);

    console.log("Phase 5 latency baseline");
    console.log(JSON.stringify({
      sampleSize: {
        quickRegister: quickRegisterDurations.length,
        teamComplete: teamCompleteDurations.length,
      },
      quickRegisterMs: {
        p50: quickP50,
        p95: quickP95,
      },
      teamCompleteMs: {
        p50: teamP50,
        p95: teamP95,
      },
    }, null, 2));
  } finally {
    await prisma.eventRegistration.deleteMany({ where: { stationId: { startsWith: `${tag}-` } } });
    await prisma.team.deleteMany({ where: { name: { startsWith: "PHASE5 LAT TEAM" } } });
    await prisma.event.deleteMany({ where: { OR: [{ id: quickEvent.id }, { id: teamEvent.id }] } });
    await prisma.payment.deleteMany({ where: { transactionId: { startsWith: `lat-tx-${tag}` } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `lat.${tag}-` } } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Phase 5 latency baseline failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
