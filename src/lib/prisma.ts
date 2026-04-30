/**
 * src/lib/prisma.ts
 *
 * Pool-aware Prisma client singleton for Next.js.
 *
 * Runtime URL routing:
 *   DATABASE_URL        → runtime queries  (may be a pooler: PgBouncer / Accelerate / Neon pooler)
 *   DIRECT_DATABASE_URL → migrations only  (direct TCP connection, bypasses pooler)
 *
 * Connection pooling strategy:
 *   - Development : direct connection, query logging enabled.
 *   - Production  : pooler URL in DATABASE_URL. If the URL begins with
 *                   "prisma://" the Accelerate extension is loaded automatically.
 *                   Otherwise the standard client is used (compatible with
 *                   PgBouncer / Supabase / Neon poolers via the URL itself).
 *
 * To enable Prisma Accelerate:
 *   1. npm install @prisma/extension-accelerate
 *   2. Set DATABASE_URL to your Accelerate connection string (prisma://...)
 *   3. The extension is loaded automatically below.
 */

import { PrismaClient, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Log levels
// ---------------------------------------------------------------------------
const devLogTargets: Prisma.LogDefinition[] = [
  { level: "query", emit: "event" },
  { level: "warn",  emit: "stdout" },
  { level: "error", emit: "stdout" },
];

const prodLogTargets: Prisma.LogDefinition[] = [
  { level: "warn",  emit: "stdout" },
  { level: "error", emit: "stdout" },
];

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------
function createPrismaClient() {
  const isDev = process.env.NODE_ENV !== "production";
  const isAccelerate = process.env.DATABASE_URL?.startsWith("prisma://") ?? false;

  const client = new PrismaClient({
    log: isDev ? devLogTargets : prodLogTargets,
    errorFormat: isDev ? "pretty" : "minimal",
    ...(isAccelerate
      ? {}
      : {
          // When NOT using Accelerate, tune connection pool directly.
          // These apply to Prisma's built-in connection pool (not PgBouncer).
          // When using PgBouncer / Supabase / Neon pool, omit connection_limit
          // from here and encode it in the DATABASE_URL query param instead.
          datasources: {
            db: {
              url: process.env.DATABASE_URL,
            },
          },
        }),
  });

  // ---------------------------------------------------------------------------
  // Dev: slow-query logger (warns on queries > 2 s)
  // ---------------------------------------------------------------------------
  if (isDev) {
    // @ts-expect-error — $on is typed for PrismaClient<{log: LogDefinition[]}>
    client.$on("query", (e: Prisma.QueryEvent) => {
      if (e.duration > 2000) {
        console.warn(
          `[prisma] slow query (${e.duration}ms):\n${e.query}\nparams: ${e.params}`
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Accelerate extension (opt-in, loaded only when package is installed)
  // ---------------------------------------------------------------------------
  if (isAccelerate) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { withAccelerate } = require("@prisma/extension-accelerate");
      return client.$extends(withAccelerate()) as unknown as PrismaClient;
    } catch {
      console.warn(
        "[prisma] DATABASE_URL is a prisma:// Accelerate URL but " +
        "@prisma/extension-accelerate is not installed.\n" +
        "Run: npm install @prisma/extension-accelerate"
      );
    }
  }

  return client;
}

// ---------------------------------------------------------------------------
// Global singleton (prevents multiple instances in Next.js dev hot-reload)
// ---------------------------------------------------------------------------
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
