# Phase 3 Concurrency Audit

## Scope
Audit of scanner/offline replay write paths for count-then-write race risk, transaction isolation, and idempotency behavior.

## Audited Flows

### 1) QUICK_REGISTER (online + offline)
- Files:
  - `src/server/actions/event-logistics.ts`
  - `src/app/api/offline/operations/sync/route.ts`
  - `src/server/services/event-registration.service.ts`
- Risks:
  - capacity check then insert under concurrent requests
- Mitigation implemented:
  - wrapped execution in Serializable transaction via `runSerializableTransaction`
  - kept duplicate registration invariant via `@@unique([userId, eventId])`
  - offline path continues to carry `clientOperationId` for replay dedupe

### 2) TEAM_ADD (online + offline)
- Files:
  - `src/server/actions/event-logistics.ts`
  - `src/app/api/offline/operations/sync/route.ts`
  - `src/server/services/team-registration.service.ts`
- Risks:
  - participant/team slot checks followed by team/member writes
- Mitigation implemented:
  - wrapped execution in Serializable transaction via `runSerializableTransaction`
  - team uniqueness preserved by schema constraints:
    - `@@unique([eventId, nameNormalized])`
    - `@@unique([eventId, teamCode])`
  - duplicate user-event registration blocked by `@@unique([userId, eventId])`

### 3) TEAM_COMPLETE bulk register+lock (online + offline)
- Files:
  - `src/server/actions/event-logistics.ts`
  - `src/app/api/offline/operations/sync/route.ts`
  - `src/server/services/team-registration.service.ts`
- Risks:
  - bulk capacity checks + multiple inserts + lock transition
- Mitigation implemented:
  - wrapped execution in Serializable transaction via `runSerializableTransaction`
  - bulk replay idempotency strengthened using `clientOperationId` per member row (`${operationId}:${shacklesId}`) in offline path
  - registration operation ledger still enforces operation-level dedupe (`RegistrationOperation.operationId @unique`)

### 4) TEAM_COMPLETE existing team lock
- Files:
  - `src/server/actions/event-logistics.ts`
  - `src/app/api/offline/operations/sync/route.ts`
  - `src/server/services/team-registration.service.ts`
- Risks:
  - leader/member role updates and lock transition racing with concurrent updates
- Mitigation implemented:
  - wrapped execution in Serializable transaction via `runSerializableTransaction`

## Verified Constraints
- `EventRegistration`: `@@unique([userId, eventId])`
- `EventRegistration`: `clientOperationId @unique`
- `Team`: `@@unique([eventId, nameNormalized])`
- `Team`: `@@unique([eventId, teamCode])`
- `RegistrationOperation`: `operationId @unique`

## Remaining Risk Notes
- Serializable retries/backoff is implemented in `transaction.service` with bounded exponential backoff and jitter.
- Additional DB-level guard constraints for derived counters (e.g., team member count consistency) remain a future hardening option.
