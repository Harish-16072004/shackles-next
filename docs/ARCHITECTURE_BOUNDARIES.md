# Architecture Boundaries (Phase 2)

## Purpose
This document defines module ownership and contribution boundaries for scanner/event logistics flows.

## Domain Service Ownership

### `src/server/services/scanner-auth.service.ts`
- Owns scanner actor authorization (`ADMIN`/`COORDINATOR`).
- Used by scanner server actions and protected scanner/offline API routes.
- Handlers should not duplicate session-role lookup logic.

### `src/server/services/attendance.service.ts`
- Owns attendance state checks and attendance write orchestration.
- Includes rules for not registered, team lock prerequisite, and already-attended behavior.
- Both online scanner action and offline sync must call this service.

### `src/server/services/team-registration.service.ts`
- Owns team membership and team completion orchestration.
- Owns team normalization and team code generation.
- Owns team min/max validation, leader validity, lock transition, and member role assignment.
- Both online scanner action and offline sync must call this service.

### `src/server/services/event-registration.service.ts`
- Owns individual quick registration + mark-attendance write flow.
- Owns payment eligibility, duplicate-registration checks, and capacity gates for individual path.
- Both online scanner action and offline sync must call this service.

### `src/server/services/capacity.service.ts`
- Owns participant/team counting and capacity-check helpers.
- Services consume this module for consistent limits behavior.

## Transport Layer Boundaries

### Server Actions (`src/server/actions/*`)
- Responsibilities:
  - authorize request,
  - call domain services,
  - map domain result to frontend contract (`{ code, message, details }`),
  - trigger revalidation.
- Must not re-implement core business rules already in services.

### API Routes (`src/app/api/**`)
- Responsibilities:
  - parse/validate payload shape,
  - authorize request,
  - call domain services,
  - map domain result to API response.
- Must not duplicate scanner/event/team business rules.

## Contribution Rules
- Add/modify business rules in service layer first.
- Keep actions/routes thin adapters.
- Reuse existing service functions for online and offline paths.
- Add stable machine reasons/codes when introducing new conflicts.
- Keep service functions deterministic and side-effect scoped to DB operations.
