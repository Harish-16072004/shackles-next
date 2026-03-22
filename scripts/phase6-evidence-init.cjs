const fs = require("node:fs");
const path = require("node:path");

function run() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:]/g, "-");
  const dir = path.join(process.cwd(), "logs", "release-evidence");
  fs.mkdirSync(dir, { recursive: true });

  const fileName = `release-evidence-${timestamp}.md`;
  const filePath = path.join(dir, fileName);

  const content = `# Release Evidence ${now.toISOString()}\n\n## Metadata\n- Release identifier:\n- Environment:\n- Freeze active: Yes / No\n\n## Checklist Status\n- [ ] Quality gates\n- [ ] Test gates\n- [ ] Migration drift check\n- [ ] Rollback verification\n- [ ] Backup/restore drill\n\n## Evidence Links\n- [PHASE6_RELEASE_CHECKLIST.md](../../PHASE6_RELEASE_CHECKLIST.md)\n- [PHASE6_DRILL_RUNBOOK.md](../../PHASE6_DRILL_RUNBOOK.md)\n- [PHASE6_FREEZE_POLICY.md](../../PHASE6_FREEZE_POLICY.md)\n- [PHASE6_READINESS_SIGNOFF.md](../../PHASE6_READINESS_SIGNOFF.md)\n\n## Approval Notes\n### Release Owner\n- Decision:\n- Notes:\n\n### Tech Lead\n- Decision:\n- Notes:\n\n### Product Owner\n- Decision:\n- Notes:\n`;

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Created release evidence template: ${path.relative(process.cwd(), filePath)}`);
}

run();
