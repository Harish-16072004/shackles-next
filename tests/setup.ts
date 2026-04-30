import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Test setup helpers.
 * - `loadTestEnv()` loads `.env.test`.
 * - `runMigrations()` runs `prisma migrate deploy`.
 * - `seedAdmin()` creates a default admin user if missing.
 *
 * These helpers are intentionally small and safe; callers should decide
 * whether to run migrations in CI or use a schema snapshot.
 */

export function loadTestEnv() {
  if (!existsSync('.env.test')) return;

  const contents = readFileSync('.env.test', 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = value;
  }
}

export function runMigrations() {
  // Run prisma migrations (sync). Callers may choose to omit this in fast CI flows.
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}

export async function seedAdmin() {
  const prisma = new PrismaClient();
  try {
    await prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        name: 'Admin',
        // `role` and other fields depend on your schema. Adjust if needed.
        role: 'ADMIN',
      } as any,
    });
  } finally {
    await prisma.$disconnect();
  }
}
