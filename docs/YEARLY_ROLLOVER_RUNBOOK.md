# Yearly Rollover Runbook

## Scope
This runbook is the operational gate for yearly cutover on a single shared database with archive-not-delete policy.

## Roles
- Release Owner: executes cutover and owns rollback decisions.
- Admin Approver: approves archive step and signoff.
- Observer: validates smoke checks and logs evidence.

## Inputs
- Source year (current active year): `YYYY`
- Target year (next year): `YYYY+1`
- Theme key: `default | classic | future`
- Public domain: release domain for the new edition

## Pre-cutover checklist
1. Create DB backup snapshot before any rollover changes.
2. Confirm `ACTIVE_YEAR`, `ACTIVE_THEME_KEY`, `ACTIVE_PUBLIC_DOMAIN` values for staging and production.
3. Verify template events exist in source year (`isTemplate=true`).
4. Confirm migration state is clean (`npx prisma migrate status`).
5. Confirm archive export and restore drill scripts are available.

## Staging drill (must pass before production)
1. Clone next year events from template:
   - `npm run bootstrap:year -- <targetYear> --from=<sourceYear>`
2. Export archive snapshot for source year:
   - `npm run archive:year:export -- <sourceYear>`
3. Run restore drill evidence:
   - `npm run archive:year:restore-drill -- <sourceYear>`
4. Flip env on staging:
   - `ACTIVE_YEAR=<targetYear>`
   - `ACTIVE_THEME_KEY=<themeKey>`
   - `ACTIVE_PUBLIC_DOMAIN=<staging-domain>`
5. Archive source year events through admin page or scripted DB update policy.
6. Verify acceptance checks:
   - Public stats only return target year events.
   - Archived source-year events are hidden publicly.
   - Admin `year=<sourceYear>&showArchived=true` can browse archived rows.
   - First approved IDs in target year start from `001` per registration type.

## Production rollout checklist
1. Capture production DB backup snapshot and backup identifier.
2. Run bootstrap for target year.
3. Set production env values for year/theme/domain.
4. Deploy application.
5. Run post-deploy smoke:
   - Public event pages show target year data only.
   - Register route rejects archived/non-active-year events.
   - Admin can filter archived source year.
6. Archive source year events after smoke pass.
7. Capture evidence files in `logs/release-evidence`.
8. Record signoff in release notes.

## Rollback checklist
1. If cutover validation fails, stop new approvals temporarily.
2. Revert env values:
   - `ACTIVE_YEAR=<sourceYear>`
   - `ACTIVE_THEME_KEY=<previousTheme>`
   - `ACTIVE_PUBLIC_DOMAIN=<previousDomain>`
3. Redeploy previous stable image or commit.
4. Restore DB snapshot only if data corruption occurred (avoid destructive restore for non-critical issues).
5. If needed, unarchive source-year events from admin for immediate visibility.
6. Re-run smoke checks on restored state.
7. Capture rollback incident note and remediation tasks.

## Evidence artifacts
- Archive export JSON: `logs/archive-exports/year-<year>-<timestamp>.json`
- Restore drill record: `logs/release-evidence/restore-drill-<year>-<timestamp>.md`
- Signoff log: release notes + admin audit entries
