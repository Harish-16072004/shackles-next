# Phase 5 SLO Baseline

## Scope
Initial SLOs for scanner/offline/public event stats paths to support weekly operational reviews.

## Services and Targets

### 1) Scanner Registration Path
- Endpoints/flows:
  - scanner quick register (service action path)
  - team complete/register flows via scanner action path
- Latency SLO (server-side):
  - p50 <= 60ms
  - p95 <= 180ms
- Error-rate SLO:
  - FAILED operations <= 1.0% per rolling 24h
- Data integrity SLO:
  - duplicate registration invariant violations = 0

### 2) Offline Sync Batch Path
- Endpoint:
  - `POST /api/offline/operations/sync`
- Latency SLO:
  - single operation p95 <= 220ms
  - batch (<= 25 ops) p95 <= 3000ms
- Reliability SLO:
  - applied ratio >= 95% per rolling 7d
  - internal FAILED ratio <= 1.5% per rolling 7d
- Replay/idempotency SLO:
  - duplicate operation replay should resolve without duplicate writes (target: 100%)

### 3) Scanner Sync Summary API
- Endpoint:
  - `GET /api/admin/scanner/sync-summary`
- Latency SLO:
  - p50 <= 80ms
  - p95 <= 250ms
- Availability SLO:
  - successful responses >= 99.5% per rolling 7d

### 4) Public Event Stats API
- Endpoint:
  - `GET /api/events/public-stats`
- Latency SLO:
  - p50 <= 120ms
  - p95 <= 350ms
- Freshness SLO:
  - registration counts reflect scanner/admin writes within one cache revalidation cycle

## Initial Baseline Snapshot (Local)
From `npm run phase5:latency:baseline` (current run):
- quickRegister: p50 12ms, p95 15ms (n=20)
- teamComplete: p50 24ms, p95 46ms (n=12)

## Weekly Operational Review Checklist
1. Check scanner/offline duration logs (`durationMs`) and compare p50/p95 to SLO thresholds.
2. Review offline sync status mix (`APPLIED`/`CONFLICT`/`FAILED`) for 24h and 7d windows.
3. Identify top conflict reasons and confirm expected business-rule conflicts dominate.
4. Investigate any INTERNAL_ERROR or FAILED spikes and file follow-up issues.
5. Confirm no duplicate registration invariants were violated in integration/stress regression runs.
6. Re-run `phase5:latency:baseline` after notable schema or service-layer changes.

## Notes
- These are initial operational targets and should be tightened with production traffic data.
- Keep thresholds realistic for current infra; adjust only with documented baseline history.
