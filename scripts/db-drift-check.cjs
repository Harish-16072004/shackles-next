const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const SUPPORTED_SCHEMES = new Set(["postgresql", "postgres", "mysql", "sqlserver", "sqlite", "cockroachdb"]);

function loadEnvFile(fileName) {
  const filePath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;

    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key]) continue;

    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const shadowDatabaseUrl = (process.env.SHADOW_DATABASE_URL || process.env.DATABASE_URL || "").trim();

if (!shadowDatabaseUrl) {
  console.error(
    "DB drift check failed: set SHADOW_DATABASE_URL (preferred) or DATABASE_URL to run prisma migrate diff against migrations directory."
  );
  process.exit(1);
}

let parsedScheme = "";
try {
  parsedScheme = new URL(shadowDatabaseUrl).protocol.replace(/:$/, "").toLowerCase();
} catch {
  console.error("DB drift check failed: SHADOW_DATABASE_URL/DATABASE_URL is not a valid URL.");
  process.exit(1);
}

if (!SUPPORTED_SCHEMES.has(parsedScheme)) {
  console.error(`DB drift check failed: unsupported datasource scheme '${parsedScheme}'.`);
  process.exit(1);
}

const migrationsDir = "prisma/migrations";

const args = [
  "exec",
  "--",
  "prisma",
  "migrate",
  "diff",
  `--from-migrations=${migrationsDir}`,
  "--to-schema-datamodel=prisma/schema.prisma",
  `--shadow-database-url=${shadowDatabaseUrl}`,
  "--exit-code",
];

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const commandArgs = npmExecPath ? [npmExecPath, ...args] : args;
const childEnv = {
  ...process.env,
  DATABASE_URL: (process.env.DATABASE_URL || shadowDatabaseUrl).trim(),
  SHADOW_DATABASE_URL: (process.env.SHADOW_DATABASE_URL || shadowDatabaseUrl).trim(),
};

const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  shell: !npmExecPath && process.platform === "win32",
  env: childEnv,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

console.error(`DB drift check failed: unable to execute Prisma CLI (${result.error.message}).`);
process.exit(1);
