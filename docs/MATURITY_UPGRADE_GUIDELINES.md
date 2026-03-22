# Shackles Symposium: Maturity Upgrade Guidelines

## Purpose
This document defines the engineering guidelines and execution checklist to move the project from:
- Feature maturity: High -> Very High
- Architecture maturity: Medium -> Very High
- Operational robustness: Medium -> Very High

---

## 1) Engineering Guidelines

### 1.1 Domain and Architecture
- Keep transport (API routes, server actions) thin.
- Keep business rules in reusable domain services.
- Ensure each business rule has a single source of truth.
- Avoid duplicating validation logic across online registration, scanner, and offline sync paths.
- Prefer composition over large "god files".
- Split heavy logistics modules into focused services:
  - `scanner-auth.service.ts`
  - `team-registration.service.ts`
  - `attendance.service.ts`
  - `capacity.service.ts`

### 1.2 Data and Transaction Integrity
- Use explicit transactions for multi-step writes.
- Protect critical invariants with database constraints (unique indexes, relation integrity).
- Treat capacity checks and team lock transitions as concurrency-sensitive operations.
- Use idempotency keys for all replayable/offline write operations.
- Use stricter transaction patterns (`Serializable`) on high-contention paths where needed.
- Prefer atomic counters/updates over count-then-insert patterns.
- Add unique/guard indexes for critical conflict and replay paths.

### 1.3 Error Handling and API Contracts
- Return structured errors with stable error codes and human-readable messages.
- Keep frontend behavior keyed to codes, not fragile message parsing.
- Include machine-readable conflict reasons for offline sync outcomes.
- Standard response contract shape:
  - `code`: stable machine code (`NOT_AUTHENTICATED`, `PAYMENT_PENDING`, `TEAM_FULL`, etc.)
  - `message`: user-friendly text
  - `details`: optional structured metadata (invalid IDs, unpaid IDs, conflict context)

### 1.4 Security and Access Control
- Enforce role checks in middleware and in server-side handlers.
- Validate all user input server-side, even if validated client-side.
- Minimize sensitive data in local storage and client payloads.
- Ensure destructive admin actions are auditable.

### 1.5 Performance and Scalability
- Replace repeated in-memory reductions on large datasets with DB-level aggregates where possible.
- Keep scanner and admin pages responsive under high load.
- Avoid unnecessary revalidation or over-broad cache invalidations.
- Measure performance before and after optimization changes.

### 1.6 Testing Standards
- Unit test domain services and validators.
- Integration test transaction-heavy flows.
- E2E test critical user journeys:
  - registration
  - payment verification
  - scanner attendance
  - team creation/locking
  - offline queue replay
- Add race/concurrency tests for capacity and lock flows.
- Add offline replay/idempotency test suite.
- Add role authorization tests for protected routes and scanner actions.

### 1.7 Migration and Release Safety
- Use migration-first DB workflow for schema changes.
- Never rely on ad-hoc production schema sync.
- Validate migration rollback strategy before release.
- Add CI gate for migration drift.
- Use proper Prisma migration workflow (`prisma migrate dev` / `prisma migrate deploy`) instead of `db push` for managed environments.

### 1.8 Observability and Operations
- Use structured logs with request correlation IDs.
- Track key health metrics:
  - sync failures
  - conflict rates
  - registration errors
  - scanner latency
- Maintain incident runbooks and rollback playbooks.
- Ensure sensitive fields are never persisted to localStorage.
- Add audit coverage for destructive admin actions (for example delete member/team operations).

---

## 2) Implementation Principles

- Prefer small, reversible changes.
- Ship in phases with clear exit criteria.
- Do not mix large refactor + large feature rollout in one release.
- Keep legacy-compatible fallbacks while migrating critical flows.
- Add telemetry before major behavior changes.
- Consolidate shared rule checks into one reusable domain function/library for:
  - eligibility
  - team min/max validation
  - payment verification
  - schedule conflict detection
  - duplicate registration checks

---

## 3) CI/CD Quality Gates (Required)

Every PR must pass:
- Lint
- Type check
- Build
- Unit tests
- Integration tests (targeted)
- Migration drift check

Release branch must additionally pass:
- E2E smoke suite
- Offline sync replay suite
- Security checks (dependency + basic route auth checks)

---

## 4) Ownership Model

- Product owner: scope and acceptance criteria
- Tech lead: architecture and risk decisions
- Domain owner (registration/scanner/admin/offline): implementation quality and tests
- Release owner: deployment, rollback readiness, and runbook verification

---

## 5) Definition of Done (Upgraded)

A change is done only if:
- Business rules are implemented in shared service layer.
- All relevant tests pass.
- Telemetry/logging is added for critical paths.
- Error codes are stable and documented.
- Migration impact is documented (if schema touched).
- Operational impact and rollback plan are noted.

---

## 6) Risks to Watch

- Race conditions during team/member registration and locking
- Rule drift between online and offline application paths
- Silent failures in queue replay and conflict handling
- Schema drift between environments
- Overly broad cache revalidation causing latency spikes

---

## 7) Implementation Checklist

### Phase 1: Safety Baseline
- [x] Enforce migration-first workflow across all environments
- [x] Add migration drift CI gate
- [x] Standardize error response shape and error codes
- [x] Add structured logs and request IDs
- [x] Add dashboards for scanner sync failures/conflicts

#### Phase 1 Implementation TODO (Execution)

- [x] Migration workflow hardening
  - [x] Add scripts in `package.json`: `db:generate`, `db:migrate:dev`, `db:migrate:deploy`, `db:status`, `db:drift:check`
  - [x] Update `MIGRATION_TODO.md` with mandatory local flow: change schema -> `prisma migrate dev` -> commit migration -> `prisma generate`
  - [x] Remove/avoid `prisma db push` usage for managed/shared environments in docs and release notes

- [x] Migration drift CI gate
  - [x] Add `.github/workflows/ci.yml` Prisma gate step using `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --exit-code`
  - [x] Fail PRs when drift is detected

- [x] Error contract standardization
  - [x] Add shared helper in `src/lib` for `{ code, message, details? }` responses
  - [x] Define first-pass canonical codes: `NOT_AUTHENTICATED`, `NOT_AUTHORIZED`, `INVALID_INPUT`, `NOT_FOUND`, `CONFLICT`, `PAYMENT_PENDING`, `CAPACITY_FULL`, `INTERNAL_ERROR`
  - [x] Update scanner + offline sync write paths to emit this shape consistently

- [x] Structured logging + request IDs
  - [x] Add request ID creation/propagation helper in `src/lib/safe-log.ts` (or adjacent logger util)
  - [x] Include `requestId`, `operationType`, `operationId`, `eventId`, `scannerUserId` in scanner/offline mutation logs
  - [x] Ensure error logs include stable code and conflict metadata

- [x] Scanner sync failure/conflict visibility
  - [x] Add an admin-focused summary endpoint for recent sync failures/conflicts (24h, 7d)
  - [x] Add a minimal dashboard card/table in admin scanner view using existing UI primitives
  - [x] Track top conflict reasons and replay success rate

### Phase 2: Architecture Refactor
- [x] Split large server action modules into domain services
- [x] Move shared validation/rules to common domain layer
- [x] Remove duplicated rule implementations across routes/actions/sync
- [x] Add module boundaries and ownership docs

#### Phase 2 Implementation TODO (Execution)

- [x] Create service modules and ownership boundaries
  - [x] Add `src/server/services/scanner-auth.service.ts`
  - [x] Add `src/server/services/team-registration.service.ts`
  - [x] Add `src/server/services/attendance.service.ts`
  - [x] Add `src/server/services/capacity.service.ts`

- [x] Wire shared scanner authorization service
  - [x] Use service in `src/server/actions/event-logistics.ts`
  - [x] Use service in `src/app/api/offline/operations/sync/route.ts`
  - [x] Use service in `src/app/api/admin/scanner/sync-summary/route.ts`
  - [x] Use service in `src/app/api/offline/participants/route.ts`

- [x] Start moving duplicated rule logic to shared domain helpers
  - [x] Replace duplicated team/event/shackles normalizers with shared helpers in scanner + sync paths
  - [x] Replace repeated participant counting/capacity checks with `capacity.service` in key registration flows
  - [x] Replace attendance registration state checks with `attendance.service` in scanner + sync paths

- [x] Complete service extraction for all logistics branches
  - [x] Move full team member add/register/lock orchestration into `team-registration.service`
  - [x] Move full attendance write workflow into `attendance.service`
  - [x] Move remaining event registration write orchestration into service layer

- [x] Remove remaining duplicated rule implementations
  - [x] Ensure online scanner actions and offline sync call same domain functions (not parallel implementations)
  - [x] Eliminate duplicate conflict/capacity checks that still exist in both files

- [x] Add module boundaries and ownership notes
  - [x] Document service ownership and file boundaries in this guideline or a dedicated architecture note
  - [x] Add short contribution rules: route/action handlers orchestrate, services own business rules

### Phase 3: Concurrency Hardening
- [x] Audit all count-then-write flows
- [x] Wrap critical paths in stricter transactional patterns
- [x] Add/verify unique constraints for critical invariants
- [x] Enforce idempotency for all replayable operations

#### Phase 3 Implementation TODO (Execution)

- [x] Audit count-then-write paths and document mitigations
  - [x] Create `PHASE3_CONCURRENCY_AUDIT.md` with flow-by-flow risk mapping
  - [x] Identify critical scanner/offline write paths (`QUICK_REGISTER`, `TEAM_ADD`, `TEAM_COMPLETE`)

- [x] Add stricter transaction handling on high-contention paths
  - [x] Add shared serializable wrapper in `src/server/services/transaction.service.ts`
  - [x] Use wrapper in scanner action flows (`quickRegisterForEvent`, team add/complete)
  - [x] Use wrapper in offline sync replay for replayable write operations

- [x] Verify and apply critical invariants
  - [x] Verify unique constraints for user-event registration, team identity, and operation ledger
  - [x] Keep conflict mapping aligned with stable error contract (`code`, `message`, `details`)

- [x] Strengthen replay idempotency
  - [x] Keep operation-level dedupe via `RegistrationOperation.operationId`
  - [x] Ensure offline `QUICK_REGISTER` and `TEAM_ADD` continue using `clientOperationId`
  - [x] Add per-member `clientOperationId` keys for offline bulk `TEAM_COMPLETE`

- [x] Remaining hardening follow-up
  - [x] Add retry/backoff strategy for serializable transaction conflicts
  - [x] Add automated verification script and runbook for Phase 3 safeguards
  - [x] Add regression tests for concurrent team register/lock and replay idempotency

### Phase 4: Test Expansion
- [x] Unit tests for validators and service-level business rules
- [x] Integration tests for registration/team/attendance transactions
- [x] E2E tests for core participant + admin + scanner journeys
- [x] Offline replay + conflict matrix tests
- [x] Concurrency stress tests for team locking and capacity paths

#### Phase 4 Implementation TODO (Execution)

- [x] Establish test harness baseline
  - [x] Add Vitest and root config (`vitest.config.ts`)
  - [x] Add test scripts in `package.json` (`test`, `test:unit`, `test:integration`)
  - [x] Create test folder structure (`tests/unit`, `tests/integration`)

- [x] Start unit coverage for service-layer business rules
  - [x] Add `capacity.service` unit tests for participant/team limit logic
  - [x] Add `team-registration.service` unit tests for normalizers/id parsing
  - [x] Add `attendance.service` unit tests for state evaluation + mark flow behavior

- [x] Start integration coverage for transaction-heavy registration flows
  - [x] Add DB-backed integration test for concurrent team register/lock transaction behavior
  - [x] Ensure integration tests isolate data via unique run tags and cleanup

- [x] Add offline replay + conflict matrix tests
  - [x] Add integration tests for duplicate operation replay and expected conflict statuses
  - [x] Add matrix cases for `QUICK_REGISTER`, `TEAM_ADD`, `TEAM_COMPLETE`, `ATTENDANCE`

- [x] Add E2E smoke journey tests
  - [x] Introduce Playwright config and baseURL strategy
  - [x] Add initial smoke specs for login, participant registration page, admin/scanner access visibility

- [x] Add concurrency stress scenarios
  - [x] Add repeated parallel lock/capacity test loops for contention confidence
  - [x] Define pass/fail thresholds for conflict rate and invariant preservation

### Phase 5: Performance and Operability
- [x] Replace heavy in-memory aggregations with DB aggregates where needed
- [x] Profile scanner/admin hotspots and optimize bottlenecks
- [x] Tune cache/revalidation strategy
- [x] Define and monitor SLOs (latency, error rate, sync reliability)

#### Phase 5 Implementation TODO (Execution)

- [x] Replace heavy in-memory aggregations with DB-native counts
  - [x] Refactor registration capacity checks (`event-registration`, `team-registration`, scanner quick register action) to use DB aggregation helper
  - [x] Refactor `/api/events/public-stats` to avoid loading registration arrays and compute counts via grouped DB queries
  - [x] Add unit coverage for aggregate helper behavior and null-size handling path

- [x] Profile scanner/admin hotspots and optimize bottlenecks
  - [x] Add lightweight timing instrumentation around scanner sync summary and offline sync batch processing
  - [x] Capture baseline p50/p95 latencies for scanner actions under local load script

- [x] Tune cache/revalidation strategy
  - [x] Audit `revalidatePath` fan-out in scanner/admin actions
  - [x] Narrow broad invalidations to route-specific targets where safe

- [x] Define and monitor initial SLOs
  - [x] Document latency and error-rate SLO targets for scanner/offline/public stats APIs
  - [x] Add dashboard query checklist for weekly operational review

### Phase 6: Release Governance
- [x] Create release checklist with rollback verification
- [x] Run backup/restore and disaster recovery drill
- [x] Validate runbooks with team walkthrough
- [x] Freeze high-risk refactors during release windows
- [x] Sign off readiness criteria for Very High maturity target

#### Phase 6 Implementation TODO (Execution)

- [x] Create release checklist with rollback verification
  - [x] Add `PHASE6_RELEASE_CHECKLIST.md` with release gates, rollback steps, and go/no-go criteria
  - [x] Add migration baseline prerequisite (`prisma/migrations` must exist)

- [x] Establish backup/restore and DR drill runbook
  - [x] Add `PHASE6_DRILL_RUNBOOK.md` with RPO/RTO targets and evidence template
  - [x] Execute drill and record measured RTO/RPO outcomes

- [x] Establish release freeze controls
  - [x] Add `PHASE6_FREEZE_POLICY.md` with restricted/allowed changes and exception path
  - [x] Add CI freeze guard (`phase6:freeze:check`) with release-window env controls
  - [x] Validate freeze policy walkthrough with release stakeholders

- [x] Establish readiness sign-off template
  - [x] Add `PHASE6_READINESS_SIGNOFF.md` with role-based approval blocks
  - [x] Capture role-based sign-off record for target release candidate

- [x] Add governance automation checks
  - [x] Add `scripts/phase6-governance-check.cjs`
  - [x] Add `scripts/phase6-evidence-init.cjs`
  - [x] Add package scripts: `phase6:governance:check`, `phase6:evidence:init`
  - [x] Add CI governance artifact check step

- [x] Close migration baseline prerequisite
  - [x] Create and commit baseline migration folder under `prisma/migrations`
  - [x] Re-run governance check after baseline is committed
  - [x] Resolve datasource/provider parsing error and re-run drift check successfully
