# BullMQ Background Jobs — Integration Guide

## Files

| File | Purpose |
|------|---------|
| `lib/redis.ts` | Shared ioredis connection (required by BullMQ) |
| `lib/queues/registry.ts` | Queue definitions + job payload types |
| `workers/qr.worker.ts` | QR code generation → upload to DO Spaces |
| `workers/csv.worker.ts` | Participant CSV export → email download link |
| `workers/idCard.worker.ts` | ID card generation via Puppeteer → DO Spaces |
| `worker.ts` | Worker process entrypoint (separate from Next.js) |
| `app/actions/jobs.ts` | Server Actions to enqueue jobs + poll status |
| `docker-compose.workers.yml` | Redis + worker service to merge into your compose |

---

## Architecture

```
Next.js (App)                    Worker Process (separate)
─────────────────────            ─────────────────────────
Server Action                    qr.worker.ts
  enqueueQRGeneration()   ──►    csvWorker.ts          ──► DO Spaces
  enqueueCSVExport()      ──►    idCard.worker.ts      ──► DO Spaces + Email
  enqueueIDCardGeneration()
         │
         ▼
      Redis (BullMQ)
         ▲
         │ getJobStatus() polls for progress
         │
      Admin UI progress bar
```

**Key principle:** Next.js only enqueues. It never runs heavy work.
Workers run in a completely separate process and can be scaled independently.

---

## Install

```bash
npm install bullmq ioredis @aws-sdk/client-s3 qrcode csv-stringify puppeteer
npm install -D @types/qrcode
```

---

## Environment variables to add

```env
REDIS_URL=redis://localhost:6379
QR_ENCRYPTION_KEY=<32-byte hex string>   # openssl rand -hex 32
DO_SPACES_CDN_URL=https://your-bucket.sgp1.cdn.digitaloceanspaces.com
```

---

## Retry behaviour

All three queues share this policy (set in `registry.ts`):

| Attempt | Delay |
|---------|-------|
| 1st retry | 2s |
| 2nd retry | 4s |
| 3rd retry | 8s |
| After 3 failures | Job marked `failed`, kept in Redis for 500 jobs |

Failed jobs are visible in Bull Board (see below) and can be manually retried.

---

## Bull Board (job dashboard)

Add this to your Next.js app for a visual job monitor:

```bash
npm install @bull-board/api @bull-board/nextjs
```

```ts
// app/api/bull-board/[[...slug]]/route.ts
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter }   from "@bull-board/api/bullMQAdapter";
import { NextJSServerAdapter } from "@bull-board/nextjs";
import { getQRQueue, getCSVQueue, getIDCardQueue } from "@/lib/queues/registry";

const serverAdapter = new NextJSServerAdapter();
serverAdapter.setBasePath("/api/bull-board");

createBullBoard({
  queues: [
    new BullMQAdapter(getQRQueue()),
    new BullMQAdapter(getCSVQueue()),
    new BullMQAdapter(getIDCardQueue()),
  ],
  serverAdapter,
});

export const { GET, POST } = serverAdapter.registerHandlers();
```

Protect this route with your ADMIN role check. Access at `/api/bull-board`.

---

## How to enqueue from existing code

**After registration payment is verified:**
```ts
import { enqueueQRGeneration } from "@/app/actions/jobs";
await enqueueQRGeneration(participant.id);
```

**From the admin CSV export button:**
```ts
import { enqueueCSVExport } from "@/app/actions/jobs";
const { jobId, message } = await enqueueCSVExport({ eventId: "..." });
// Show message to admin, then poll getJobStatus("csv", jobId) for progress
```

**From the bulk ID card button:**
```ts
import { enqueueIDCardGeneration } from "@/app/actions/jobs";
const { jobIds, total } = await enqueueIDCardGeneration({ format: "PDF" });
```

---

## Chunking strategy for ID cards

ID card jobs are split into chunks of 50 participants. This means:
- A retry only re-processes 50 cards, not thousands
- Progress reporting is granular
- Memory stays bounded per job (Puppeteer)

---

## Scaling

Single container (your current setup): works as-is.

If you ever need more throughput:
- **QR generation**: increase `concurrency` in `qr.worker.ts` (it's I/O bound)
- **CSV exports**: add a second worker process (BullMQ handles distribution)
- **ID cards**: add more memory to the worker container; Puppeteer is the bottleneck
- **Multi-replica**: Redis pub/sub already handles job distribution — no code changes needed
