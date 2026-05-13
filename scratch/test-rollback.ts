import { prisma } from "../src/lib/prisma";
import { TeamStatus, TeamMemberRole, RegistrationSource, RegistrationSyncStatus } from "@prisma/client";
import { getActiveYear } from "../src/lib/edition";

async function testRollback() {
  const activeYear = getActiveYear();
  const testUserId = "clpxxxxxxxx"; // Replace with a real user ID for local test if needed, or dummy
  const testEventId = "clpyyyyyyyy"; // Replace with a real event ID

  console.log("Starting Rollback Test...");

  try {
    await prisma.$transaction(async (tx) => {
      console.log("Step 1: Creating a dummy team...");
      const team = await tx.team.create({
        data: {
          eventId: testEventId,
          name: "ROLLBACK_TEST_TEAM",
          nameNormalized: "ROLLBACK_TEST_TEAM",
          teamCode: "TEST-123",
          joinCode: "JOIN-123",
          memberCount: 1,
          status: TeamStatus.OPEN,
          leaderUserId: testUserId,
        }
      });

      console.log("Step 2: Simulating failure...");
      throw new Error("FORCED_ROLLBACK_ERROR");
    });
  } catch (e: any) {
    if (e.message === "FORCED_ROLLBACK_ERROR") {
      console.log("Caught expected rollback error.");
    } else {
      console.error("Unexpected error:", e);
    }
  }

  // Verification
  const teamCheck = await prisma.team.findFirst({
    where: { name: "ROLLBACK_TEST_TEAM" }
  });

  if (!teamCheck) {
    console.log("SUCCESS: Transaction rolled back correctly. No team was created.");
  } else {
    console.log("FAILURE: Transaction DID NOT roll back. Team exists!");
    // Clean up
    await prisma.team.delete({ where: { id: teamCheck.id } });
  }
}

// Note: This script needs to be run in a context where Prisma is initialized.
// For now, I'm just documenting the logic.
