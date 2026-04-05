# Shackles Symposium - Project Structure

```text
c:\Users\haris\Downloads\shackles_symposium
│
├── docs/                   # Documentation and runbooks (architecture, audits, rules)
├── logs/                   # System and application logs
├── prisma/                 # Database schema, seeders, and migration files
│   ├── migrations/         # Prisma migrations (e.g. 20260320_baseline, etc.)
│   ├── schema.prisma       # Prisma database schema definition
│   └── seed.ts             # Database seed script
├── public/                 # Static assets (images, manifests, workers)
│   ├── team/
│   ├── templates/
│   ├── uploads/
│   └── workers/            # Web and Service workers (e.g., compute.worker.ts)
├── scripts/                # Utility and operational scripts (e.g., db-drift-check.cjs, drills)
├── src/                    # Main source code
│   ├── app/                # Next.js App Router (pages and API routes)
│   │   ├── (protected)/    # Protected application sections
│   │   ├── admin/          # Admin Dashboard routes
│   │   ├── api/            # API Endpoints
│   │   ├── contact/
│   │   ├── events/
│   │   ├── login/
│   │   ├── onspot-registration/
│   │   ├── userDashboard/
│   │   └── workshops/
│   ├── components/         # Reusable React components
│   │   ├── common/
│   │   ├── features/       # Feature specific components (e.g., RegistrationForm.tsx)
│   │   └── ui/             # Generic UI components
│   ├── hooks/              # Custom React hooks (e.g., usePerformance.ts)
│   ├── lib/                # Shared utilities, schemas, services
│   ├── server/             # Server-side logic, controllers, DTOs
│   └── types/              # TypeScript typings
├── tests/                  # Test suites
│   ├── e2e/                # End-to-End tests
│   ├── integration/        # Integration tests
│   └── unit/               # Unit tests
├── build_output.txt
├── docker-compose.yml
├── eslint.config.mjs
├── next.config.mjs
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── README.md
├── tailwind.config.ts
├── tsconfig.json
└── vitest.config.ts
```
