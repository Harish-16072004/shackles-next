const { execSync } = require("node:child_process");

const HIGH_RISK_PATTERNS = [
  /^src\/server\/services\//,
  /^src\/server\/actions\//,
  /^src\/app\/api\/offline\/operations\/sync\/route\.ts$/,
  /^src\/app\/api\/events\/register\/route\.ts$/,
  /^prisma\/schema\.prisma$/,
];

function runGitDiff(reference) {
  const output = execSync(`git diff --name-only ${reference}`, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveChangedFiles() {
  const explicitRef = (process.env.PHASE6_FREEZE_GIT_REF || "").trim();
  if (explicitRef) {
    return runGitDiff(explicitRef);
  }

  try {
    return runGitDiff("origin/main...HEAD");
  } catch {
    try {
      return runGitDiff("HEAD~1..HEAD");
    } catch {
      return [];
    }
  }
}

function isFreezeActive() {
  return (process.env.RELEASE_FREEZE_ACTIVE || "").toLowerCase() === "true";
}

function hasException() {
  return (process.env.PHASE6_FREEZE_EXCEPTION || "").toLowerCase() === "true";
}

function matchesHighRisk(filePath) {
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(filePath));
}

function run() {
  if (!isFreezeActive()) {
    console.log("Phase 6 freeze check skipped (RELEASE_FREEZE_ACTIVE is not true).");
    return;
  }

  if (hasException()) {
    console.log("Phase 6 freeze check bypassed via PHASE6_FREEZE_EXCEPTION=true.");
    return;
  }

  const changedFiles = resolveChangedFiles();
  const highRiskFiles = changedFiles.filter(matchesHighRisk);

  if (highRiskFiles.length > 0) {
    console.error("Phase 6 freeze check failed: high-risk refactor files changed during freeze window.");
    for (const file of highRiskFiles) {
      console.error(` - ${file}`);
    }
    console.error("Set PHASE6_FREEZE_EXCEPTION=true only for explicitly approved exceptions.");
    process.exit(1);
  }

  console.log("Phase 6 freeze check passed.");
}

run();
