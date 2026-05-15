# Shackles Symposium — Project Structure

> Generated: 2026-05-14 | Next.js 14 + Prisma + TypeScript

```
shackles_symposium/
│
├── prisma/                              # Database schema & migrations
│   ├── migrations/                      # Prisma migration history
│   │   ├── 20260320_baseline/
│   │   ├── 20260322_shackles_id_sequence/
│   │   ├── 20260322_yearly_event_isolation/
│   │   ├── 20260322182927_add_onspot_registration_console/
│   │   ├── 20260430_add_authjs_session_models/
│   │   ├── 20260509043142_add_marking_system/
│   │   └── 20260512075900_fix_team_status_default/
│   ├── schema.prisma                    # Database schema definition
│   ├── seed.ts                          # Database seed script
│   └── seed-users.ts                    # User seeding data
│
├── public/                              # Static assets
│   ├── icons/                           # App icons
│   ├── templates/                       # ID card templates
│   │   └── id-card-template.png
│   ├── workers/                         # Web workers
│   │   └── compute.worker.ts
│   ├── manifest.json                    # PWA manifest
│   ├── sw.js                            # Service worker
│   └── offline.html                     # PWA offline fallback
│
├── scripts/                             # Operational scripts
│   ├── archive-year-export.ts           # Year-end data archive
│   ├── archive-year-restore-drill.ts    # Restore drill for archives
│   ├── bootstrap-year.ts               # New year bootstrapping
│   └── cleanup-stale-records.ts         # Stale data cleanup
│
├── src/                                 # Application source code
│   ├── app/                             # Next.js App Router pages
│   │   ├── (protected)/                 # Auth-guarded routes
│   │   │   └── accommodation/page.tsx
│   │   │
│   │   ├── admin/                       # Admin pages
│   │   │   ├── accommodations/page.tsx
│   │   │   ├── adminDashboard/page.tsx
│   │   │   ├── audit-logs/page.tsx
│   │   │   ├── event-registrations/     # Event reg management
│   │   │   │   ├── [eventId]/           # Dynamic event detail
│   │   │   │   └── page.tsx
│   │   │   ├── events/page.tsx
│   │   │   ├── id-cards/page.tsx
│   │   │   ├── liveDashboard/page.tsx
│   │   │   ├── marking/                 # Judge marking system
│   │   │   │   ├── allocate/
│   │   │   │   └── page.tsx
│   │   │   ├── messages/page.tsx
│   │   │   ├── onspot-registration/page.tsx
│   │   │   ├── payments/page.tsx
│   │   │   ├── scanner/                 # QR scanner console
│   │   │   │   ├── kit/                 # Kit distribution
│   │   │   │   └── page.tsx
│   │   │   ├── staff-management/page.tsx
│   │   │   ├── users/page.tsx
│   │   │   └── page.tsx
│   │   │
│   │   ├── api/                         # API routes
│   │   │   ├── admin/                   # Admin APIs
│   │   │   │   ├── accommodations/
│   │   │   │   ├── csv/                 # CSV import/export
│   │   │   │   │   ├── audit/export/
│   │   │   │   │   ├── events/{export,import,template}/
│   │   │   │   │   └── registrations/{export,import,template}/
│   │   │   │   ├── event-registrations/
│   │   │   │   │   ├── change-leader/
│   │   │   │   │   ├── delete-member/
│   │   │   │   │   └── delete-team/
│   │   │   │   ├── id-cards/export/
│   │   │   │   ├── payments/export/
│   │   │   │   ├── scanner/sync-summary/
│   │   │   │   └── sync-events/
│   │   │   ├── chat/route.ts            # AI chat endpoint
│   │   │   ├── events/
│   │   │   │   ├── my-registrations/
│   │   │   │   ├── public-stats/
│   │   │   │   └── register/           # Team/event registration
│   │   │   ├── files/payment-proof/[...path]/
│   │   │   ├── health/route.ts
│   │   │   ├── live-sync/route.ts       # SSE live sync
│   │   │   ├── marking/                 # Marking system APIs
│   │   │   │   ├── component/
│   │   │   │   ├── criteria/
│   │   │   │   ├── leaderboard/
│   │   │   │   ├── submit-marks/
│   │   │   │   └── team-marks/
│   │   │   ├── scanner/                 # Scanner APIs
│   │   │   │   ├── check-registration/
│   │   │   │   ├── create-team/
│   │   │   │   ├── qr-scan/
│   │   │   │   └── register-for-event/
│   │   │   ├── team/invite/
│   │   │   └── upload/payment-proof/
│   │   │
│   │   ├── contact/page.tsx
│   │   ├── events/                      # Public event pages
│   │   │   ├── technical/page.tsx
│   │   │   ├── non-technical/page.tsx
│   │   │   ├── special/page.tsx
│   │   │   └── page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── login/page.tsx
│   │   ├── onspot-registration/page.tsx
│   │   ├── register/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── staff/                       # Staff portals
│   │   │   ├── coordinatorDashboard/page.tsx
│   │   │   ├── volunteerDashboard/page.tsx
│   │   │   ├── no-assignment/page.tsx
│   │   │   └── no-permission/page.tsx
│   │   ├── team/page.tsx
│   │   ├── terms-and-conditions/page.tsx
│   │   ├── userDashboard/page.tsx
│   │   ├── workshops/page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx                   # Root layout
│   │   ├── manifest.ts                  # PWA manifest
│   │   └── page.tsx                     # Landing page
│   │
│   ├── components/                      # React components
│   │   ├── common/                      # Shared components
│   │   │   ├── Header.tsx
│   │   │   ├── LiveSyncRefresher.tsx
│   │   │   ├── MobileNav.tsx
│   │   │   └── NavLinks.tsx
│   │   ├── features/                    # Feature-specific components
│   │   │   ├── admin/
│   │   │   │   ├── ChangeLeaderForm.tsx
│   │   │   │   ├── EventRegistrationCard.tsx
│   │   │   │   └── EventRegistrationDeleteForms.tsx
│   │   │   ├── ai-chat/ChatWidget.tsx
│   │   │   ├── AccommodationForm.tsx
│   │   │   ├── AllocateMarks.tsx
│   │   │   ├── CoordinatorMarking.tsx
│   │   │   ├── CountdownOptimized.tsx
│   │   │   ├── EventAttendanceScanner.tsx
│   │   │   ├── EventCategoryPage.tsx
│   │   │   ├── InviteModal.tsx
│   │   │   ├── KitDistributionScanner.tsx
│   │   │   ├── LeaderboardView.tsx
│   │   │   ├── OnSpotRegistrationForm.tsx
│   │   │   ├── RegistrationForm.tsx
│   │   │   ├── ResetPasswordForm.tsx
│   │   │   ├── ScannerWidget.tsx
│   │   │   ├── ScoringSetup.tsx
│   │   │   └── StaffEventCard.tsx
│   │   └── ui/                          # Reusable UI primitives
│   │       ├── Autocomplete.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── input.tsx
│   │       └── Pagination.tsx
│   │
│   ├── data/
│   │   └── events-context.ts            # Event data context
│   │
│   ├── hooks/                           # Custom React hooks
│   │   ├── usePerformance.ts
│   │   └── useWorker.ts
│   │
│   ├── lib/                             # Shared utilities
│   │   ├── digitalocean/spaces.ts       # DO Spaces client
│   │   ├── id-cards/compose-card.ts     # ID card generator
│   │   ├── schemas/                     # Zod schemas
│   │   │   ├── onspot-registration-schema.ts
│   │   │   └── registration-schema.ts
│   │   ├── storage/                     # Storage abstraction
│   │   ├── validation/phone.ts          # Phone validation
│   │   ├── admin-audit.ts               # Audit logging
│   │   ├── admin-audit-read.ts          # Audit log queries
│   │   ├── cached-queries.ts            # Cached DB queries
│   │   ├── compress-image.ts            # Image compression
│   │   ├── crypto-config.ts             # Crypto config
│   │   ├── csv.ts                       # CSV utilities
│   │   ├── edition.ts                   # Active year logic
│   │   ├── email.ts                     # Email sending
│   │   ├── env.ts                       # Environment config
│   │   ├── env-validation.ts            # Env validation
│   │   ├── error-contract.ts            # Error types
│   │   ├── permissions.ts               # RBAC permissions
│   │   ├── prisma.ts                    # Shared Prisma client
│   │   ├── rate-limit.ts                # Rate limiter
│   │   ├── safe-action.ts               # Safe action wrapper
│   │   ├── safe-log.ts                  # Safe error logging
│   │   ├── session.ts                   # Session management
│   │   ├── storage-provider.ts          # Storage provider
│   │   ├── theme-registry.ts            # MUI theme registry
│   │   └── utils.ts                     # General utilities
│   │
│   ├── server/                          # Server-side logic
│   │   ├── actions/                     # Server actions
│   │   │   ├── accommodation.ts
│   │   │   ├── admin.ts
│   │   │   ├── auth.ts
│   │   │   ├── contact.ts
│   │   │   ├── event-logistics.ts       # Scanner & logistics
│   │   │   ├── forgot-password.ts
│   │   │   ├── login.ts
│   │   │   ├── marking-allocation.ts
│   │   │   ├── marking.ts
│   │   │   ├── onspot-registration.ts
│   │   │   ├── onspot-user-registration.ts
│   │   │   ├── register-full.ts
│   │   │   └── staff-management.ts
│   │   ├── email/                       # Email templates
│   │   │   ├── templates/
│   │   │   │   ├── entry-pass.ts
│   │   │   │   ├── member-joined.ts
│   │   │   │   ├── team-created.ts
│   │   │   │   └── team-locked.ts
│   │   │   └── email.service.ts
│   │   └── services/                    # Business logic services
│   │       ├── ai.service.ts
│   │       ├── attendance.service.ts
│   │       ├── capacity.service.ts
│   │       ├── email.service.ts
│   │       ├── event-archive.service.ts
│   │       ├── event-registration.service.ts
│   │       ├── qr-management.service.ts
│   │       ├── qr.service.ts
│   │       ├── registration-helpers.service.ts
│   │       ├── scanner-auth.service.ts
│   │       ├── shackles-id.service.ts
│   │       ├── team-operations.service.ts
│   │       ├── team-registration.service.ts  # ← Core team logic
│   │       ├── transaction.service.ts
│   │       └── year-bootstrap.service.ts
│   │
│   ├── types/                           # TypeScript types
│   │   ├── auth.ts
│   │   └── global.d.ts
│   ├── auth.config.ts                   # Auth.js config
│   ├── auth.ts                          # Auth.js setup
│   └── instrumentation.ts              # Telemetry
│
├── tests/                               # Test suites
│   ├── e2e/                             # Playwright E2E tests
│   │   ├── auth.spec.ts
│   │   ├── onspot-registration.parity.spec.ts
│   │   ├── onspot-registration.public.spec.ts
│   │   ├── onspot-registration.spec.ts
│   │   ├── scanner-v2-wizard.spec.ts
│   │   ├── smoke.spec.ts
│   │   └── team-registration.spec.ts
│   ├── integration/                     # Vitest integration tests
│   │   ├── admin-delete-team.route.test.ts
│   │   ├── event-archive.service.test.ts
│   │   ├── onspot-registration.console.test.ts
│   │   ├── onspot-registration.public.test.ts
│   │   ├── payment-proof.upload.route.test.ts
│   │   ├── scanner-v2.parity.test.ts
│   │   ├── shackles-id.sequence.test.ts
│   │   ├── team-registration.bulk-failures.test.ts
│   │   ├── team-registration.route-compat.test.ts
│   │   ├── team-registration.stress.test.ts
│   │   ├── team-registration.transaction.test.ts
│   │   ├── year-bootstrap.service.test.ts
│   │   └── year-visibility.routes.test.ts
│   ├── unit/                            # Vitest unit tests
│   │   ├── attendance.service.test.ts
│   │   ├── capacity.service.test.ts
│   │   ├── edition.test.ts
│   │   ├── permissions.test.ts
│   │   ├── phone-validation.test.ts
│   │   ├── rate-limit.test.ts
│   │   ├── shackles-id.service.test.ts
│   │   ├── team-registration.service.test.ts
│   │   └── validation.test.ts
│   └── setup.ts                         # Test setup/globals
│
├── unwanted/                            # Archived/deprecated files
│   ├── dead-docs/                       # Old documentation
│   ├── dead-output/                     # Old build artifacts
│   ├── dead-scripts/                    # Deprecated scripts
│   └── root-stray-files/                # Cleaned-up root files
│
├── .env                                 # Environment variables
├── .env.example                         # Env template
├── .gitignore
├── docker-compose.yml                   # Docker config
├── Dockerfile
├── eslint.config.mjs                    # ESLint config
├── next.config.mjs                      # Next.js config
├── package.json
├── playwright.config.ts                 # Playwright config
├── postcss.config.mjs                   # PostCSS config
├── README.md
├── TECH_STACK.md                        # Technology documentation
├── tsconfig.json                        # TypeScript config
└── vitest.config.ts                     # Vitest config
```

## Quick Stats

| Category | Count |
|----------|-------|
| Pages (App Router) | ~30 |
| API Routes | ~25 |
| React Components | ~25 |
| Server Actions | 13 |
| Business Services | 15 |
| Unit Tests | 9 |
| Integration Tests | 13 |
| E2E Tests | 7 |
| DB Migrations | 7 |
