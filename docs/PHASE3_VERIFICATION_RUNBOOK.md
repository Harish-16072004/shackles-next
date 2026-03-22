# Phase 3 Verification Runbook

## Purpose
Provide repeatable verification for Phase 3 concurrency hardening without introducing a new test framework.

## Automated Checks
Run:
- `npm run phase3:verify`
- `npm run phase3:test:regression`

This script verifies:
- critical schema uniqueness constraints for registration/team/operation invariants
- serializable transaction isolation and retry/backoff presence
- serializable wrapper usage in scanner actions and offline sync paths
- per-member idempotency key generation for offline bulk team completion

The regression test script verifies with real DB writes (and cleanup):
- concurrent team register/lock contention allows only one successful lock path
- duplicate replay of same team-complete operation is blocked idempotently
- operation ledger `operationId` uniqueness blocks duplicate replay records

## Type Safety Check
Run:
- `npx tsc --noEmit`

## Manual Concurrency Drill (Optional, Staging Recommended)
1. Trigger parallel `QUICK_REGISTER` requests for the same participant/event and verify single registration.
2. Trigger parallel `TEAM_ADD` requests near capacity and verify limits are respected.
3. Trigger parallel `TEAM_COMPLETE` bulk operations with same operationId payload and verify replay idempotency.
4. Validate sync operation records in `RegistrationOperation` for conflicts/failures/applied states.

## Expected Outcomes
- No duplicate `EventRegistration` rows for same user+event.
- Team constraints hold under contention.
- Replay path remains idempotent for same operation IDs.
- Serializable conflicts resolve via bounded retries where possible.

## Known Remaining Work
- Add true automated concurrent integration tests once test harness is introduced (tracked in Phase 3 checklist).
