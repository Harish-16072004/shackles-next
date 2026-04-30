# Project Structure & Architecture

## Overview
Shackles Symposium is a multi-year event platform built with **Next.js**, **Prisma**, and **Tailwind CSS**. It manages multi-year operations across one unified database.

## System Architecture

### Multi-Year Operation
The project is designed to handle multi-year events dynamically.
- Uses Yearly Controls via environment variables (`ACTIVE_YEAR`, `ACTIVE_THEME_KEY`, `ACTIVE_PUBLIC_DOMAIN`).
- Capable of seeding template events (`isTemplate=true`).
- Provides bootstrapping flows to clone templates to target years (`npm run bootstrap:year`).
- Contains archiving components to snapshot and export data per year.

### Architecture Boundaries
The application delineates logic strictly across specific boundary layers:

#### Domain Service Layer (`src/server/services/*`)
Owns heavily concentrated core business rules logic, decoupled from HTTP endpoints. 
- **scanner-auth.service**: Manages scanner actor authorization (ADMIN/COORDINATOR).
- **attendance.service**: Manages attendance states and orchestrated writes.
- **team-registration.service**: Takes care of team orchestration, code generation, and limits.
- **event-registration.service**: Path for quick signups and capacities.
- **capacity.service**: Participant counts and limit policies.

#### Transport Layer
- **Server Actions (`src/server/actions/*`)**: Authenticate/authorize -> Call Domain Service -> Return payload mapped to frontend components -> Trigger Revalidation. Must never reinvent business logic.
- **API Routes (`src/app/api/**`)**: Payload validation/parsing -> Call Domain -> Map response payload.

### Tech Stack
- **Framework**: Next.js App Router
- **ORM / Database**: Prisma (PostgreSQL presumably based on models, schema migrations present)
- **Styling**: Tailwind CSS
- **Testing**: Vitest for Unit/Integration, Playwright for E2E
- **Offline Sync & Service Workers**: Standard local caching via `workbox` and Service Workers (`sw.js`). PWA manifest configurations.

---

## Folder Structure

```
├── docs/                   # Internal architecture patterns, migration runbooks, drills, and policies
├── logs/                   # Server side or script file logging
├── prisma/                 
│   ├── schema.prisma       # Relational models setup
│   ├── seed.ts             # Default data seeding
│   └── migrations/         # Migrations state management
├── public/                 # Static assets, PWA config, templates, Web Workers and uploaded media assets
├── scripts/                # Utility scripts (Bootstrap year, test wrappers, drift-checks, evidence init)
├── src/
│   ├── middleware.ts       # Application edge routing/authorization logic
│   ├── app/                # Next.js App Router root
│   │   ├── (protected)/    # Logged-in gated frontend views
│   │   ├── admin/          # Management capabilities
│   │   ├── api/            # API specific endpoints implementations
│   │   ├── events/         # Single or multi event browsing
│   │   ├── onspot-registration/
│   │   └── terms-and-conditions/
│   ├── components/
│   │   ├── common/         # Standard re-usable stateless components (Buttons, Inputs etc.)
│   │   ├── features/       # Heavily typed complex components for logic domains
│   │   └── ui/             # Baseline UI atoms
│   ├── hooks/              # Custom React hooks (data fetching, caching, UX interactions)
│   ├── lib/                # Non-business helpers (e.g. formatters, utils, external lib configurations)
│   ├── server/             # Deeply nested business boundaries/Server Actions/Services
│   └── types/              # TS interface definitions mapping objects
├── tests/                  # Layered test definitions
│   ├── e2e/
│   ├── integration/
│   └── unit/
└── ...configs files        # tsconfig, eslint, postcss, tailwind, playwright configs 
```
