const fs = require("node:fs");
const path = require("node:path");

function exists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const requiredFiles = [
    "PHASE6_RELEASE_CHECKLIST.md",
    "PHASE6_DRILL_RUNBOOK.md",
    "PHASE6_FREEZE_POLICY.md",
    "PHASE6_READINESS_SIGNOFF.md",
    "PHASE5_SLO_BASELINE.md",
    "PHASE5_CACHE_REVALIDATION_AUDIT.md",
  ];

  for (const file of requiredFiles) {
    assert(exists(file), `Missing required governance artifact: ${file}`);
  }

  assert(exists("prisma/migrations"), "Missing prisma/migrations baseline. Create and commit a baseline migration before release sign-off.");

  const checklist = read("PHASE6_RELEASE_CHECKLIST.md");
  assert(checklist.includes("Rollback Verification"), "Release checklist missing rollback verification section.");

  const drill = read("PHASE6_DRILL_RUNBOOK.md");
  assert(drill.includes("RPO") && drill.includes("RTO"), "DR drill runbook must define RPO/RTO targets.");

  const signoff = read("PHASE6_READINESS_SIGNOFF.md");
  assert(signoff.includes("Release Owner") && signoff.includes("Tech Lead") && signoff.includes("Product Owner"), "Readiness signoff must include all required role approvals.");

  const freezePolicy = read("PHASE6_FREEZE_POLICY.md");
  assert(freezePolicy.includes("high-risk-refactor"), "Freeze policy should include high-risk-refactor control guidance.");

  console.log("Phase 6 governance check passed.");
}

try {
  run();
} catch (error) {
  console.error("Phase 6 governance check failed:", error.message);
  process.exit(1);
}
