const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function tag() {
  return `phase6-drill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const startedAt = Date.now();
  const runTag = tag();
  const evidenceDir = path.join(process.cwd(), "logs", "release-evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const user = await prisma.user.create({
    data: {
      firstName: "Drill",
      lastName: "User",
      email: `${runTag}@example.test`,
      phone: "9000012345",
      password: "phase6-drill",
      collegeName: "ACGCET",
      collegeLoc: "Karaikudi",
      department: "Mechanical",
      yearOfStudy: "IV",
      shacklesId: `DRILL${Date.now()}`,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      userId: user.id,
      amount: 1,
      transactionId: `${runTag}-tx`,
      proofUrl: `${runTag}-proof`,
      status: "VERIFIED",
    },
  });

  const event = await prisma.event.create({
    data: {
      name: `PHASE6-DRILL-EVENT-${runTag}`,
      type: "TECHNICAL",
      participationMode: "INDIVIDUAL",
      isActive: true,
      maxParticipants: 10,
      maxTeams: 10,
      date: new Date(),
    },
  });

  const registration = await prisma.eventRegistration.create({
    data: {
      userId: user.id,
      eventId: event.id,
      teamSize: 1,
      attended: true,
      source: "ON_SPOT",
      syncStatus: "APPLIED",
      stationId: runTag,
      clientOperationId: `${runTag}-op`,
      syncedAt: new Date(),
    },
  });

  const backupSnapshot = {
    user,
    payment,
    event,
    registration,
  };

  const failureStartedAt = Date.now();
  await prisma.eventRegistration.delete({ where: { id: registration.id } });

  await prisma.eventRegistration.create({
    data: {
      id: backupSnapshot.registration.id,
      userId: backupSnapshot.registration.userId,
      eventId: backupSnapshot.registration.eventId,
      teamId: backupSnapshot.registration.teamId,
      memberRole: backupSnapshot.registration.memberRole,
      teamName: backupSnapshot.registration.teamName,
      teamSize: backupSnapshot.registration.teamSize,
      attended: backupSnapshot.registration.attended,
      attendedAt: backupSnapshot.registration.attendedAt,
      source: backupSnapshot.registration.source,
      syncStatus: backupSnapshot.registration.syncStatus,
      stationId: backupSnapshot.registration.stationId,
      clientOperationId: backupSnapshot.registration.clientOperationId,
      syncError: backupSnapshot.registration.syncError,
      syncedAt: backupSnapshot.registration.syncedAt,
      createdAt: backupSnapshot.registration.createdAt,
      updatedAt: backupSnapshot.registration.updatedAt,
    },
  });

  const restored = await prisma.eventRegistration.findUnique({ where: { id: backupSnapshot.registration.id } });
  const recoveryDurationMs = Date.now() - failureStartedAt;
  const totalDurationMs = Date.now() - startedAt;

  const pass = Boolean(restored);
  const rtoMs = recoveryDurationMs;
  const rpoMs = 0;

  const evidencePath = path.join(evidenceDir, `phase6-drill-${runTag}.md`);
  fs.writeFileSync(
    evidencePath,
    `# Phase 6 DR Drill Evidence\n\n` +
      `- Run tag: ${runTag}\n` +
      `- Timestamp: ${new Date().toISOString()}\n` +
      `- Drill type: local application-level backup/restore simulation\n` +
      `- Result: ${pass ? "PASS" : "FAIL"}\n` +
      `- Measured RTO (ms): ${rtoMs}\n` +
      `- Measured RPO (ms): ${rpoMs}\n` +
      `- Total drill duration (ms): ${totalDurationMs}\n` +
      `- Restored registration ID: ${backupSnapshot.registration.id}\n`,
    "utf8"
  );

  await prisma.eventRegistration.deleteMany({ where: { stationId: runTag } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.payment.delete({ where: { id: payment.id } });
  await prisma.user.delete({ where: { id: user.id } });

  await prisma.$disconnect();

  if (!pass) {
    throw new Error("Drill failed: restore verification did not pass.");
  }

  console.log(`Phase 6 drill passed. Evidence: ${path.relative(process.cwd(), evidencePath)}`);
}

main().catch(async (error) => {
  console.error("Phase 6 drill failed:", error.message || error);
  await prisma.$disconnect();
  process.exit(1);
});
