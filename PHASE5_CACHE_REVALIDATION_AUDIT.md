# Phase 5 Cache/Revalidation Audit

## Scope
Focused on scanner/admin mutation paths where repeated `revalidatePath` fan-out can increase cache churn.

## Audited Hotspot
- `src/server/actions/event-logistics.ts`
  - Repeated invalidations after team add / team complete flows.
  - Broad `revalidatePath('/admin')` call for kit issuance.

## Changes Applied
1. Consolidated repeated revalidation lists into helpers:
   - `revalidateScannerAdminSurfaces()` for:
     - `/admin/event-registrations`
     - `/admin/events`
     - `/admin/adminDashboard`
   - `revalidatePublicEventSurfaces()` for:
     - `/events` using `layout` scope (covers category pages under `/events/*`)
     - `/workshops`
2. Replaced broad admin invalidation:
   - From: `/admin`
   - To: `/admin/adminDashboard`

## Why This Is Safer and Leaner
- Keeps affected surfaces synchronized after scanner mutations.
- Reduces unnecessary broad invalidation at the `/admin` root.
- Uses layout-level invalidation for event route subtree to avoid multiple per-page invalidations while preserving correctness.

## Remaining Phase 5 Cache Work
- Review non-scanner admin/API mutation paths for similar consolidation opportunities.
- Evaluate if some user-facing invalidations can be event-scoped once route cache tags are introduced.
