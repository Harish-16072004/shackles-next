# Leaderboard SSE — Integration Guide

## Files

| File | Purpose |
|------|---------|
| `app/api/leaderboard/stream/route.ts` | SSE Route Handler — streams live updates to clients |
| `app/actions/submitMarks.ts` | Server Action — saves marks, then calls `broadcastLeaderboardUpdate` |
| `hooks/useLeaderboardSSE.ts` | React hook — connects to SSE, handles reconnect with backoff |
| `components/Leaderboard.tsx` | Drop-in UI component |

---

## How it works

```
Coordinator submits marks
        │
        ▼
submitMarks() Server Action
        │  saves to DB via Prisma
        │
        ▼
broadcastLeaderboardUpdate(eventId)
        │  fetches fresh leaderboard
        │  pushes to all connected EventSource clients
        ▼
useLeaderboardSSE hook receives data
        │
        ▼
Leaderboard UI re-renders instantly
```

No polling. No WebSocket server to maintain. Works on DigitalOcean App Platform
and any standard Node.js host.

---

## Drop-in usage

```tsx
// app/events/[id]/leaderboard/page.tsx
import { Leaderboard } from "@/components/Leaderboard";

export default function LeaderboardPage({ params }: { params: { id: string } }) {
  return <Leaderboard eventId={params.id} eventName="Circuit Design" />;
}
```

---

## Prisma schema additions

```prisma
model EventScore {
  id            String   @id @default(cuid())
  eventId       String
  participantId String?
  teamId        String?
  totalScore    Float
  breakdown     Json
  submittedBy   String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  event       Event        @relation(fields: [eventId], references: [id])
  participant Participant? @relation(fields: [participantId], references: [id])
  team        Team?        @relation(fields: [teamId], references: [id])

  @@unique([eventId, participantId])
  @@unique([eventId, teamId])
}
```

---

## Nginx config (required if behind reverse proxy)

```nginx
location /api/leaderboard/stream {
  proxy_pass         http://localhost:3000;
  proxy_http_version 1.1;
  proxy_set_header   Connection '';       # disable keep-alive chunking
  proxy_buffering    off;                 # critical for SSE
  proxy_cache        off;
  proxy_read_timeout 86400s;             # 24h — prevents proxy killing idle connections
}
```

---

## Notes

- The `clients` map is **in-process** — works fine for a single Docker container.
  If you scale to multiple replicas, replace the map with a Redis pub/sub channel
  (e.g. `ioredis` subscriber per replica).
- The keepalive ping every 25s prevents load balancers from closing idle connections.
- The hook uses exponential backoff (1s → 2s → 4s … 30s cap) on reconnect.
