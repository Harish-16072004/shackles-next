# Yearly Editions Plan Status Audit (2026-03-22)

## Summary
- Milestones M1-M10 are implemented in code, scripts, tests, and documentation.
- M0 operational steps are documented; execution is environment-specific at release time.

## Milestone Status

### M0 Safety prep
- Partial (execution-time)
- Evidence:
  - Feature work is isolated in workspace changes.
  - Runbook/checklists in `YEARLY_ROLLOVER_RUNBOOK.md` include pre-cutover backup and env matrix steps.
- Remaining: actual backup snapshot artifact must be produced per environment during release.

### M1 Year controls and resolver
- Done
- Evidence:
  - `src/lib/edition.ts`
  - `src/lib/env.ts`
  - `tests/unit/edition.test.ts`

### M2 Schema support for yearly isolation
- Done
- Evidence:
  - `prisma/schema.prisma`
  - `prisma/migrations/20260322_yearly_event_isolation/migration.sql`

### M3 Archive flow replaces destructive delete
- Done
- Evidence:
  - `src/app/admin/events/page.tsx` (archive/restore actions, labels)

### M4 Active-year public visibility enforcement
- Done
- Evidence:
  - `src/app/api/events/public-stats/route.ts`
  - `src/app/api/events/register/route.ts`
  - `src/server/services/event-registration.service.ts`
  - `src/server/services/team-registration.service.ts`

### M5 Admin archive explorer and year switch
- Done
- Evidence:
  - `src/app/admin/events/page.tsx` (year filter + archived toggle)
  - `scripts/bootstrap-year.ts` + `src/lib/admin-audit.ts` (bootstrap audit logging)

### M6 Master template and annual clone workflow
- Done
- Evidence:
  - `prisma/seed.ts` (template seeding)
  - `scripts/bootstrap-year.ts`
  - `package.json` script `bootstrap:year`
  - `README.md` usage docs

### M7 Shackles ID yearly reset and compatibility
- Done
- Evidence:
  - Sequence-backed allocator in `src/server/services/shackles-id.service.ts`.
  - Payment approval uses serializable transaction + sequence allocation in `src/server/actions/admin.ts`.
  - Year-segmented QR storage path in `src/server/actions/admin.ts`.
  - Tests in `tests/unit/shackles-id.service.test.ts` and `tests/integration/shackles-id.sequence.test.ts`.

### M8 Theme and domain yearly rotation
- Done
- Evidence:
  - Theme registry in `src/lib/theme-registry.ts`.
  - Metadata wired to active year/theme/domain in `src/app/layout.tsx`.
  - Dynamic manifest in `src/app/manifest.ts`.
  - Manifest versioning strategy (`manifest` query + manifest `id` keyed by year/theme).
  - Domain-aware image host config in `next.config.mjs`.
  - Operational docs in `README.md`.

### M9 Archive operations and storage governance
- Done
- Evidence:
  - Archive policy doc `YEARLY_ARCHIVE_POLICY.md`.
  - Year-segmented QR upload path in `src/server/actions/admin.ts`.
  - Archive export script `scripts/archive-year-export.ts`.
  - Restore drill script `scripts/archive-year-restore-drill.ts`.
  - Commands documented in `README.md`.

### M10 Test matrix and rollout
- Done
- Evidence:
  - Unit tests for resolver and Shackles ID behavior:
    - `tests/unit/edition.test.ts`
    - `tests/unit/shackles-id.service.test.ts`
  - Integration tests:
    - `tests/integration/year-visibility.routes.test.ts` (public stats + register year gating)
    - `tests/integration/event-archive.service.test.ts` (archive/restore non-destructive behavior)
    - `tests/integration/year-bootstrap.service.test.ts` (idempotency)
    - `tests/integration/shackles-id.sequence.test.ts` (year/type reset and collision safety)
  - E2E smoke coverage in `tests/e2e/smoke.spec.ts` for active-year visibility, archived-year hiding, and admin archived-year browsing.
  - Production rollout and rollback checklists in `YEARLY_ROLLOVER_RUNBOOK.md`.
