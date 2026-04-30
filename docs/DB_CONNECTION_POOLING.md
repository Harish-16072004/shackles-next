# Database Connection Pooling

This document covers how to configure connection pooling for the Shackles Symposium
PostgreSQL database in staging and production environments.

---

## Why pooling is required

Next.js runs as a serverless / multi-worker Node.js process. Each worker can open
its own Prisma client, which in turn opens its own connection(s) to PostgreSQL.
Without pooling this can quickly exhaust `max_connections` (default: 100) on the
database server during peak registration traffic.

---

## Option A — Prisma Accelerate (Recommended)

Prisma Accelerate is a globally distributed connection pool managed by Prisma.

1. Enable Accelerate in the [Prisma Console](https://console.prisma.io).
2. Copy your Accelerate connection string (starts with `prisma://`).
3. Update your environment:

```env
# .env.production
DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=<YOUR_API_KEY>"
```

4. Install the Accelerate extension:

```bash
npm install @prisma/extension-accelerate
```

5. Extend your Prisma client in `src/lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient().$extends(withAccelerate());

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

---

## Option B — PgBouncer (Self-hosted)

If you host PostgreSQL yourself (e.g., on a VPS or via Docker), run PgBouncer
in front of it in **transaction mode**.

```ini
# pgbouncer.ini (key settings)
[databases]
shackles = host=127.0.0.1 port=5432 dbname=shackles_symposium

[pgbouncer]
pool_mode = transaction
max_client_conn = 200
default_pool_size = 25
```

Then update `DATABASE_URL` to point at PgBouncer (default port 6432) and add
the `pgbouncer=true` parameter to disable Prisma's prepared statements:

```env
DATABASE_URL="postgresql://user:pass@localhost:6432/shackles_symposium?pgbouncer=true&connection_limit=1"
```

> **Important:** `connection_limit=1` per Prisma client instance is correct when
> using PgBouncer in transaction mode.

---

## Option C — Supabase / Neon built-in pooler

If you use Supabase or Neon, they provide a built-in connection pooler.

- **Supabase:** Use the *Transaction* pooler URL from your project dashboard
  (port 6543). Add `?pgbouncer=true` to the connection string.
- **Neon:** Use the *pooled* connection string from the Neon console.
  No extra parameters required.

```env
# Supabase example
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:6543/postgres?pgbouncer=true"

# Neon example
DATABASE_URL="postgresql://[user]:[pass]@[endpoint]-pooler.neon.tech/shackles?sslmode=require"
```

---

## Local development

Local dev uses a direct connection (no pooler needed).

```env
# .env.local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shackles_symposium"
```

The `docker-compose.yml` in the project root spins up PostgreSQL and Redis for
local development. See [README.md](../README.md) for setup instructions.

---

## Migrations

Always run migrations through the **direct** (non-pooled) URL, not the pooler.
Add a separate env var for migration use:

```env
# Used only by prisma migrate commands
DIRECT_DATABASE_URL="postgresql://user:pass@host:5432/shackles_symposium"
```

In `prisma/schema.prisma`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // pooler URL for runtime
  directUrl = env("DIRECT_DATABASE_URL") // direct URL for migrations
}
```
