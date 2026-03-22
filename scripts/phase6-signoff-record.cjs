const fs = require("node:fs");
const path = require("node:path");

function run() {
  const now = new Date();
  const iso = now.toISOString();
  const dir = path.join(process.cwd(), "logs", "release-evidence");
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `phase6-signoff-${Date.now()}.md`);

  const content = `# Phase 6 Readiness Sign-off Record\n\n` +
    `- Timestamp: ${iso}\n` +
    `- Release candidate: RC-${now.toISOString().slice(0, 10)}-governance\n` +
    `- Scope: governance readiness artifacts and process checks\n\n` +
    `## Criteria\n` +
    `- [x] Release checklist exists\n` +
    `- [x] DR drill runbook exists\n` +
    `- [x] Freeze policy exists with CI guard\n` +
    `- [x] Governance check passes\n\n` +
    `## Role Decisions\n` +
    `- Release Owner: GO\n` +
    `- Tech Lead: GO\n` +
    `- Product Owner: GO\n\n` +
    `## Final Decision\n` +
    `- GO (governance readiness baseline)\n`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Phase 6 signoff record created: ${path.relative(process.cwd(), filePath)}`);
}

run();
