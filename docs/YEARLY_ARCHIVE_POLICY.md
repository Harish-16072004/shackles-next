# Yearly Archive Policy

## Purpose
This policy defines how yearly Shackles event data is archived and restored without hard deletion.

## Archive trigger
- Archive trigger date: after year-close signoff is approved.
- Required approver: ADMIN role owner.
- Public visibility rule: only active year data must be public.

## Archive action
- Archive is non-destructive.
- Event rows are marked with `isArchived=true` and `isActive=false`.
- Related registrations, teams, and logs remain retained.

## Restore action
- Restore is admin-only and reversible.
- Restored event rows are marked with `isArchived=false` and `isActive=true`.

## Year rollover sequence
1. Verify template rows for source year (`isTemplate=true`).
2. Run yearly bootstrap for target year.
3. Switch `ACTIVE_YEAR`, `ACTIVE_THEME_KEY`, and `ACTIVE_PUBLIC_DOMAIN`.
4. Archive previous year events after post-switch verification.

## Restore drill
1. Pick one archived event in a non-active year.
2. Restore event from admin events page.
3. Verify admin visibility and registrations integrity.
4. Re-archive event and log drill evidence in `logs/release-evidence`.
