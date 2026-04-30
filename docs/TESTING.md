# Testing Guide

This document describes how to run, write, and extend tests for the Shackles Symposium codebase.

Quick commands

- Run unit + integration tests (Vitest):

```bash
npm run test
```

- Run Vitest in watch mode:

```bash
npm run test:watch
```

- Run Playwright E2E tests:

```bash
npm run test:e2e
```

Environment

- Create a `.env.test` file (copy from `.env.example`) and set a `PLAYWRIGHT_DATABASE_URL` pointing to a dedicated test database.
- Playwright and Vitest pick up env vars from the shell; CI should set secret env vars.

Playwright setup

- `playwright.config.ts` should be configured to use `.env.test` for `use` and `webServer` if applicable.
- Provide `tests/setup.ts` to programmatically seed the test DB before the E2E run and tear it down afterwards.

Vitest test structure

- Unit tests: `tests/unit/*.test.ts`
- Integration tests: `tests/integration/*.test.ts`
- E2E (Playwright): `tests/e2e/*.e2e.ts`

Writing tests

- Use dependency injection or service wrappers to avoid hitting external APIs in unit tests.
- Validate Zod schemas with isolated tests (`validation.test.ts`).
- Mock Auth.js session behavior in unit tests by stubbing `src/lib/session.ts` methods.
- For rate-limit tests, use the in-memory mode of `src/lib/rate-limit.ts` to avoid needing Redis.

Example: Simple Vitest test

```ts
import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/lib/env-validation';

describe('env validation', () => {
  it('throws for missing core env', () => {
    expect(() => validateEnv({} as any)).toThrow();
  });
});
```

Seeding the test DB

- Create `tests/setup.ts` that:
  - Reads `.env.test`
  - Runs `prisma migrate deploy` (or uses a schema snapshot)
  - Seeds necessary users (an admin user, a test participant)
  - Exposes helper functions for tests to create/tear down data

CI

- Add `npm run test` to the CI workflow after build and typecheck.
- For E2E, consider running Playwright in a separate job with a service container for the test DB.

Tips

- Keep tests deterministic: avoid relying on wall-clock timing.
- Use `vi.mock()` to stub heavy modules (AI, Pinecone, external SMTP).
- Keep test snapshots stable; avoid embedding environment-specific data.

Troubleshooting

- "Cannot connect to database" in Playwright tests: ensure `PLAYWRIGHT_DATABASE_URL` points to a reachable DB and migrations have been applied.
- Flaky tests: isolate by running the failing test with `-t` and inspect logs.

Maintainers: If you need help adding a new test harness or CI integration, I can create `tests/setup.ts`, a sample unit test, or update `.github/workflows/ci.yml` to run tests.