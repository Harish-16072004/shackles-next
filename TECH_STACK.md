# Shackles Symposium — Tech Stack

> Full-stack event management platform for college symposiums — registration, payments, QR-based logistics, team management, scoring, and admin dashboards.

---

## Core Framework

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | [Next.js](https://nextjs.org/) (App Router) | `^16.2.4` |
| **Language** | [TypeScript](https://www.typescriptlang.org/) | `^5.9.3` |
| **Runtime** | [Node.js](https://nodejs.org/) | `20` (Alpine) |
| **React** | [React](https://react.dev/) | `^19.2.5` |
| **Bundler** | [Turbopack](https://turbo.build/pack) | Built-in (via `next dev --turbopack`) |
| **Module Target** | ESNext / Bundler resolution | — |

- **App Router** with file-system routing (`src/app/`)
- **Server Components** by default, Client Components opt-in
- **Server Actions** (`src/server/actions/`) for mutations
- **API Route Handlers** (`src/app/api/`) for REST endpoints
- **Standalone output** mode for Docker deployments

---

## Database

| Component | Technology | Details |
|-----------|-----------|---------|
| **Database** | [PostgreSQL](https://www.postgresql.org/) | `15-alpine` (local), `16` (CI) |
| **ORM** | [Prisma](https://www.prisma.io/) | `^5.19.1` |
| **Adapter** | `@prisma/client` | `^5.19.1` |

### Prisma Highlights

- **Schema location:** `prisma/schema.prisma` (582 lines, 20+ models)
- **Migrations:** version-controlled in `prisma/migrations/`
- **Seed scripts:** `prisma/seed.ts` and `prisma/seed-users.ts` (via `tsx`)
- **Dual URL config:** `DATABASE_URL` (pooler) + `DIRECT_DATABASE_URL` (direct TCP for migrations)
- **Key models:** `User`, `Event`, `Team`, `Payment`, `EventRegistration`, `MarkingCriteria`, `JudgeMarking`, `Session`

---

## Authentication & Authorization

| Component | Technology | Details |
|-----------|-----------|---------|
| **Auth Library** | [NextAuth.js v5](https://authjs.dev/) (beta) | `5.0.0-beta.28` |
| **Adapter** | `@auth/prisma-adapter` | `^2.11.2` |
| **Provider** | Credentials (email + password) | — |
| **Password Hashing** | [bcryptjs](https://github.com/nicolo-ribaudo/bcryptjs) | `^3.0.3` |
| **JWT** | [jose](https://github.com/panva/jose) | `^6.1.3` |
| **Session Strategy** | JWT | 7-day max age |

### Roles & Permissions

```
APPLICANT → PARTICIPANT → VOLUNTEER → COORDINATOR → ADMIN
```

- Role-based access control with a `RolePermission` model
- Permissions: `SCAN_ATTENDANCE`, `SCAN_KIT`, `ONSPOT_INDIVIDUAL_REG`, `ONSPOT_TEAM_REG`, `MANAGE_TEAMS`, `MANAGE_SCORES`

---

## Styling & UI

| Component | Technology | Version |
|-----------|-----------|---------|
| **CSS Framework** | [Tailwind CSS](https://tailwindcss.com/) | `v4.2.4` |
| **PostCSS Plugin** | `@tailwindcss/postcss` | `^4.2.4` |
| **Utility Merging** | [tailwind-merge](https://github.com/dcastil/tailwind-merge) | `^3.5.0` |
| **Conditional Classes** | [clsx](https://github.com/lukeed/clsx) | `^2.1.1` |
| **Icons** | [Lucide React](https://lucide.dev/) | `^0.563.0` |

- Custom `@utility` directives (`btn-primary`, `input-field`, `card`)
- Tailwind CSS v4 (CSS-first config via `@import 'tailwindcss'`)

---

## Storage & Media

| Component | Technology | Details |
|-----------|-----------|---------|
| **Object Storage** | [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) (S3-compatible) | Production |
| **Local Storage** | File system (`storage/`) | Development |
| **AWS SDK** | `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | `^3.888.0` |
| **Image Processing** | [sharp](https://sharp.pixelplumbing.com/) | `^0.34.5` |
| **Client Compression** | [browser-image-compression](https://github.com/nicolo-ribaudo/browser-image-compression) | `^2.0.2` |

- Configurable via `STORAGE_PROVIDER` env (`local` | `digitalocean`)
- CDN support via `DO_SPACES_CDN_BASE_URL`
- Presigned URL uploads

---

## Email

| Component | Technology | Details |
|-----------|-----------|---------|
| **Transactional Email** | [Resend](https://resend.com/) | `^6.12.3` |
| **SMTP Fallback** | [Nodemailer](https://nodemailer.com/) | `^8.0.5` |

- Used for: payment verification, team creation, team lock, event registration confirmations
- Graceful fallback: silently fails in dev when keys are not set

---

## AI & Search (Optional)

| Component | Technology | Details |
|-----------|-----------|---------|
| **AI / LLM** | [Google Generative AI](https://ai.google.dev/) (Gemini) | `@google/genai ^1.51.0` |

- Powers chatbot feature
- Optional — activated via `GOOGLE_GENERATIVE_AI_API_KEY`

---

## QR Code & Scanner

| Component | Technology | Details |
|-----------|-----------|---------|
| **QR Scanner (primary)** | [html5-qrcode](https://github.com/nicolo-ribaudo/html5-qrcode) | `^2.3.8` |
| **QR Scanner (alt)** | [@yudiel/react-qr-scanner](https://github.com/yudielcovo/react-qr-scanner) | `^2.5.1` |

- Mobile-first QR scanning for attendance & kit distribution
- Dynamic QR tokens with expiry for anti-replay protection

---

## PDF Generation

| Component | Technology | Version |
|-----------|-----------|---------|
| **PDF Engine** | [PDFKit](https://pdfkit.org/) | `^0.17.2` |

- Used for ID card generation and export functionality

---

## Rate Limiting & Caching

| Component | Technology | Details |
|-----------|-----------|---------|
| **Rate Limiter** | [@upstash/ratelimit](https://upstash.com/) | `^2.0.8` |
| **Redis Client** | [@upstash/redis](https://upstash.com/) | `^1.37.0` |
| **Local Redis** | [Redis](https://redis.io/) `7-alpine` | Docker Compose (dev) |

- Production: Upstash Redis (serverless)
- Development: falls back to in-memory rate limiting
- Server-side caching via `src/lib/cached-queries.ts`

---

## Form Handling & Validation

| Component | Technology | Version |
|-----------|-----------|---------|
| **Form Library** | [React Hook Form](https://react-hook-form.com/) | `^7.72.1` |
| **Schema Validation** | [Zod](https://zod.dev/) | `^4.3.6` |
| **RHF ↔ Zod Bridge** | [@hookform/resolvers](https://github.com/react-hook-form/resolvers) | `^5.2.2` |

---

## PWA

| Component | Technology | Version |
|-----------|-----------|---------|
| **PWA Plugin** | [next-pwa](https://github.com/nicolo-ribaudo/next-pwa) | `^5.6.0` |

- Service worker registration with `skipWaiting`
- Runtime caching with Workbox defaults
- Disabled in development mode
- Manifest generated via `src/app/manifest.ts`

---

## Testing

| Layer | Technology | Version | Details |
|-------|-----------|---------|---------|
| **Unit / Integration** | [Vitest](https://vitest.dev/) | `^4.1.2` | Node environment, thread pool |
| **E2E** | [Playwright](https://playwright.dev/) | `^1.59.1` | Chromium, auto web-server spin-up |

- **Vitest:** `tests/**/*.test.ts`, path aliases via `@/`
- **Playwright:** `tests/e2e/`, dedicated test DB, auto-starts dev server on port `3100`

---

## Code Quality

| Tool | Technology | Details |
|------|-----------|---------|
| **Linter** | [ESLint](https://eslint.org/) `^9.0.0` | Flat config (`eslint.config.mjs`) |
| **ESLint Preset** | `eslint-config-next` | Core Web Vitals + TypeScript |
| **Transpiler** | [SWC](https://swc.rs/) | `@swc/core ^1.15.18` (via Next.js) |
| **Script Runner** | [tsx](https://github.com/privatenumber/tsx) | `^4.21.0` (for seed/scripts) |

---

## CI / CD

### GitHub Actions

| Workflow | Trigger | Jobs |
|----------|---------|------|
| **CI** (`ci.yml`) | Push to `main`/`dev`, PRs | Lint → Typecheck → Unit Tests → Build → Migration drift check → Governance checks |
| **E2E** | After `quality` job (PRs + main) | Playwright E2E with PostgreSQL 16 service container |
| **Deploy** (`deploy.yml`) | After CI succeeds on `main` | Docker build → Push to DO Container Registry → Trigger App Platform redeploy |

---

## Deployment & Infrastructure

| Component | Technology | Details |
|-----------|-----------|---------|
| **Container** | [Docker](https://www.docker.com/) | Multi-stage build (deps → builder → runner) |
| **Base Image** | `node:20-alpine` | — |
| **Hosting** | [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform) | Container-based |
| **Container Registry** | [DigitalOcean Container Registry](https://www.digitalocean.com/products/container-registry) | — |
| **Object Storage** | DigitalOcean Spaces (S3-compatible) | CDN-enabled |
| **Local Dev** | Docker Compose | PostgreSQL 15 + Redis 7 |

### Docker Build

```
Stage 1 (deps)    → npm ci
Stage 2 (builder) → prisma generate + next build
Stage 3 (runner)  → Standalone server (non-root user)
```

- Health check at `/api/health` (pings DB)
- Exposes port `3000`

---

## Security

- **Content Security Policy** headers with per-environment tuning
- **X-Frame-Options:** `DENY`
- **X-Content-Type-Options:** `nosniff`
- **Referrer-Policy:** `strict-origin-when-cross-origin`
- **Permissions-Policy:** camera self-only, no mic/geo
- **RBAC** with role + permission model
- **Rate limiting** on API routes (Upstash Redis / in-memory fallback)
- **Environment validation** via `src/lib/env-validation.ts`
- Non-root Docker user (`nextjs:nodejs`)

---

## Operational Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Bootstrap Year | `npm run bootstrap:year` | Seed data for a new symposium year |
| Archive Export | `npm run archive:year:export` | Export year data for archival |
| Archive Restore Drill | `npm run archive:year:restore-drill` | Test restoring archived data |
| DB Cleanup | `npm run db:cleanup` | Remove stale/orphaned records |
| DB Seed | `npm run db:seed` | Seed dev database |

---

## Project Structure

```
shackles_symposium/
├── .github/workflows/      # CI + Deploy pipelines
├── prisma/                  # Schema, migrations, seeds
├── public/                  # Static assets, PWA manifest
├── scripts/                 # Operational CLI scripts
├── src/
│   ├── app/                 # Next.js App Router (pages + API routes)
│   │   ├── (protected)/     # Auth-guarded routes
│   │   ├── admin/           # Admin dashboard
│   │   ├── api/             # REST API handlers
│   │   ├── staff/           # Staff management
│   │   └── ...              # Public pages (register, login, events, etc.)
│   ├── auth.ts              # NextAuth v5 config
│   ├── components/          # React components (common / features / ui)
│   ├── data/                # Static data files
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Shared utilities, Prisma client, storage, email
│   ├── server/              # Server actions, services, email templates
│   └── types/               # TypeScript type definitions
├── tests/                   # Vitest unit + Playwright E2E tests
├── storage/                 # Local file storage (dev)
├── Dockerfile               # Multi-stage production build
├── docker-compose.yml       # Local dev services (Postgres + Redis)
└── package.json
```
