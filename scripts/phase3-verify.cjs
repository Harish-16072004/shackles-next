const fs = require("fs");
const path = require("path");

function read(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  return fs.readFileSync(filePath, "utf8");
}

function assertMatch(content, pattern, message) {
  if (!pattern.test(content)) {
    throw new Error(message);
  }
}

function run() {
  const schema = read("prisma/schema.prisma");
  const txService = read("src/server/services/transaction.service.ts");
  const scannerActions = read("src/server/actions/event-logistics.ts");
  const offlineSync = read("src/app/api/offline/operations/sync/route.ts");
  const teamService = read("src/server/services/team-registration.service.ts");

  assertMatch(schema, /@@unique\(\[userId,\s*eventId\]\)/, "Missing EventRegistration unique(userId,eventId) constraint");
  assertMatch(schema, /clientOperationId\s+String\?\s+@unique/, "Missing EventRegistration clientOperationId unique constraint");
  assertMatch(schema, /@@unique\(\[eventId,\s*nameNormalized\]\)/, "Missing Team unique(eventId,nameNormalized) constraint");
  assertMatch(schema, /@@unique\(\[eventId,\s*teamCode\]\)/, "Missing Team unique(eventId,teamCode) constraint");
  assertMatch(schema, /operationId\s+String\s+@unique/, "Missing RegistrationOperation operationId unique constraint");

  assertMatch(txService, /TransactionIsolationLevel\.Serializable/, "Serializable isolation level not configured");
  assertMatch(txService, /P2034|serialize access|serialization|deadlock/i, "Retryable serializable conflict detection not found");
  assertMatch(txService, /maxRetries\s*\?\?\s*3/, "Default retry count not found");

  assertMatch(scannerActions, /runSerializableTransaction\(/, "Scanner actions are not using runSerializableTransaction");
  assertMatch(offlineSync, /runSerializableTransaction\(/, "Offline sync route is not using runSerializableTransaction");
  assertMatch(teamService, /clientOperationId:\s*`\$\{input\.operationId\}:\$\{shacklesId\}`/, "Bulk TEAM_COMPLETE idempotency key pattern not found");

  console.log("Phase 3 verification passed.");
}

try {
  run();
} catch (error) {
  console.error("Phase 3 verification failed:", error.message);
  process.exit(1);
}
