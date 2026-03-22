# Phase 6 Backup/Restore & Disaster Recovery Drill Runbook

## Objective
Run a repeatable backup/restore and disaster recovery drill and record evidence.

## Suggested Targets
- RPO: <= 15 minutes
- RTO: <= 60 minutes

## Preconditions
- Non-production environment with production-like schema.
- Access to database backup tooling.
- Access to storage bucket and restore credentials.
- Freeze active for drill window.

## Drill Steps
1. Baseline snapshot
   - Record current deployment version/commit.
   - Record current migration version.
2. Create backup
   - Execute DB backup command for current environment.
   - Record backup artifact location, checksum, timestamp.
3. Simulate failure
   - Choose one scenario:
     - accidental data deletion
     - schema mismatch
     - application rollback requirement
4. Restore
   - Restore DB from backup artifact.
   - Re-run migration status check.
   - Verify critical tables and row counts.
5. App recovery
   - Roll back app to known-good release if needed.
6. Verify
   - Login, scanner access, public stats, and offline sync summary routes.
7. Record metrics
   - Measured RPO and RTO.
   - Any deviations/failures.

## Evidence Template
- Drill date/time:
- Scenario:
- Backup artifact:
- Restore commands executed:
- RPO measured:
- RTO measured:
- Validation results:
- Follow-up actions:

## Outcome Rules
- PASS: Recovery within targets and all validation checks pass.
- FAIL: Any unresolved critical validation failure or exceeded RTO/RPO without accepted waiver.
