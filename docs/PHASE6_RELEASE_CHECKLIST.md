# Phase 6 Release Checklist (DigitalOcean-Focused)

## Purpose
Operational checklist for release readiness with rollback verification for app, database, and storage paths.

## Owners
- Release Owner
- Tech Lead
- Product Owner

## Prerequisite (Hard Gate)
- `prisma/migrations` baseline exists and is committed.
- `npm run db:drift:check` passes.

## Pre-Release Gates
1. Quality gates
   - `npm run lint`
   - `npx tsc --noEmit`
   - `npm run build`
2. Test gates
   - `npm run test:unit`
   - `npm run test:integration`
   - `npm run test:e2e`
3. Reliability gates
   - `npm run phase3:verify`
   - `npm run phase3:test:regression`
4. Performance/operability gates
   - `npm run phase5:latency:baseline`
   - Review [PHASE5_SLO_BASELINE.md](PHASE5_SLO_BASELINE.md)
5. Governance gates
   - `npm run phase6:governance:check`

## Rollback Verification (Before Go-Live)
1. Database rollback plan verified
   - Identify current migration and rollback target
   - Confirm rollback command and data impact note
2. App rollback plan verified
   - Previous known-good image/version available
   - Rollback command documented for deployment target
3. Storage rollback plan verified
   - Confirm storage migration rollback path in [DIGITALOCEAN_MIGRATION_PLAN.md](DIGITALOCEAN_MIGRATION_PLAN.md)
4. Communication plan verified
   - Incident channel and owner on-call confirmed

## Release Execution
1. Freeze window active (see [PHASE6_FREEZE_POLICY.md](PHASE6_FREEZE_POLICY.md)).
2. Deploy migration set.
3. Deploy application.
4. Run smoke checks:
   - login page
   - scanner access control
   - admin dashboard access
   - public event stats endpoint

## Post-Release Verification
1. Check scanner/offline error rates and latency logs (`durationMs`).
2. Verify sync summary endpoint health (`/api/admin/scanner/sync-summary`).
3. Confirm no duplicate registration anomalies.
4. Capture baseline release evidence in [PHASE6_READINESS_SIGNOFF.md](PHASE6_READINESS_SIGNOFF.md).

## Go/No-Go Decision
- Go requires all gates passed and sign-off by:
  - Release Owner
  - Tech Lead
  - Product Owner
