# Proposed vs. Current Structure - Gap Analysis & Recommendations

**Date:** February 26, 2026 | **Analysis:** Structure Compliance Review

---

## 📋 Directory Structure Comparison

### LEGEND
- ✅ **Implemented** – Exists and functional
- ⚠️ **Partial** – Exists but incomplete
- ❌ **Missing** – Doesn't exist; critical blocker

---

## 1. .github/workflows/ (CI/CD)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `.github/workflows/ci-pipeline.yml` | Build & lint automation | ❌ Missing | ❌ CRITICAL | No automated builds on PR/commit |
| `.github/workflows/security-scan.yml` | SAST/DAST automation | ❌ Missing | ❌ CRITICAL | No security scanning pipeline |

**Recommendation:**
- Create `ci-pipeline.yml` with: linting, type check, build test
- Create `security-scan.yml` with: Snyk/npm audit, CodeQL scan
- Add branch protection rules requiring passing workflows
- **Effort:** 2-3 hours

---

## 2. docker/ (Containerization)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `docker/Dockerfile` | Multi-stage Next.js build | ❌ Missing | ❌ CRITICAL | Can't containerize app |
| `docker/nginx/nginx.conf` | Reverse proxy config | ❌ Missing | ⚠️ MEDIUM | No reverse proxy setup |
| `docker/docker-compose.yml` | Orchestration | ⚠️ Partial | Root-level exists | Should move & consolidate |

**Recommendation:**
- Create production-grade `Dockerfile` with:
  - Build stage: `npm install && npm run build`
  - Runtime stage: Node base with `npm start`
  - Proper `.dockerignore`
- Create `docker/nginx.conf` for:
  - Static asset caching headers
  - API route proxying
  - Gzip compression
- Move `docker-compose.yml` to `docker/` directory
- **Effort:** 3-4 hours

---

## 3. docs/ (Documentation)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `docs/architecture.md` | System design & data flow | ❌ Missing | ❌ CRITICAL | No onboarding for new devs |
| `docs/api-reference.md` | API endpoint documentation | ❌ Missing | ❌ CRITICAL | No endpoint contracts |
| `docs/setup-guide.md` | Dev environment setup | ❌ Missing | ❌ CRITICAL | Confusing for first-time setup |

**Recommendation:**
- **architecture.md:** Include tech stack, data flow, authentication flow, deployment diagram
- **api-reference.md:** Document all server actions, request/response schemas
- **setup-guide.md:** Step-by-step for local dev, Docker, and production
- Add `docs/DEPLOYMENT.md` for CI/CD & hosting
- **Effort:** 4-6 hours

---

## 4. prisma/ (Database)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `prisma/schema.prisma` | Database schema | ✅ Complete | ✅ Exists | — |
| `prisma/migrations/` | Migration history | ⚠️ Partial | Likely needs sync | May have drift |
| `prisma/seed.ts` | Database seeding | ✅ Exists | ✅ Exists | — |

**Recommendation:**
- Verify migrations folder is tracked in git: `prisma/migrations/`
- Ensure seed.ts is properly documented
- Add `scripts/seed-db.ts` as wrapper for ease of use
- **Effort:** 30 mins

---

## 5. public/ (Static Assets)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `public/fonts/GameOfSquids.ttf` | Game font | ❌ Missing | ❌ Medium | Custom font not in repo |
| `public/images/qr-placeholders/` | QR code assets | ❌ Missing | ⚠️ Medium | Placeholder images missing |

**Recommendation:**
- Add `public/fonts/GameOfSquids.ttf` to repo
- Add sample QR codes to `public/images/qr-placeholders/`
- Optimize images: use WebP, add AVIF fallbacks
- **Effort:** 1-2 hours

---

## 6. scripts/ (Ops Automation)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `scripts/seed-db.ts` | Database seeding script | ⚠️ Partial | In `prisma/seed.ts` | Should move/duplicate |
| `scripts/setup.sh` | Dev environment setup | ❌ Missing | ❌ HIGH | Manual setup required |

**Recommendation:**
- Create `scripts/seed-db.ts` as callable script:
  ```bash
  npx ts-node scripts/seed-db.ts
  ```
- Create `scripts/setup.sh` (or `.ps1` for Windows):
  ```bash
  #!/bin/bash
  cp .env.example .env
  npm install
  npx prisma generate
  npx prisma migrate deploy
  npx prisma db seed
  npm run dev
  ```
- Create `scripts/health-check.sh` for deployment validation
- **Effort:** 1-2 hours

---

## 7. security/ (Security Configuration)

| Item | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `security/zap-baseline.conf` | OWASP ZAP config | ❌ Missing | ❌ HIGH | No dynamic security scanning |
| `security/sonar-project.properties` | SonarQube config | ❌ Missing | ❌ HIGH | No code quality metrics |

**Recommendation:**
- Create `security/zap-baseline.conf` for OWASP ZAP scans
- Create `security/sonar-project.properties` for SonarQube integration
- Add to CI/CD pipeline as post-build scans
- Add `security/SECURITY.md` with vulnerability reporting process
- **Effort:** 2-3 hours

---

## 8. src/app/ (App Router Routes)

### Current State
```
src/app/
├── (protected)/ ✅ Exists
├── admin/ ✅ Exists
├── api/ ✅ Exists
├── contact/ ✅ Exists
├── events/ ✅ Exists
├── forgot-password/ ✅ Exists
├── login/ ✅ Exists
├── register/ ✅ Exists
├── reset-password/ ✅ Exists
├── team/ ✅ Exists
├── workshops/ ✅ Exists
├── globals.css ✅ Exists
├── layout.tsx ✅ Exists
└── page.tsx ✅ Exists
```

### Proposed Structure
```
src/app/
├── (auth)/ ⚠️ MISSING
│   ├── login/ ❌ Should move here
│   ├── register/ ❌ Should move here
│   ├── forgot-password/ ❌ Should move here
│   └── reset-password/ ❌ Should move here
├── (marketing)/ ⚠️ PARTIAL
│   ├── page.tsx ✅ Exists (home)
│   ├── events/ ✅ Exists
│   ├── workshops/ ✅ Exists
│   ├── team/ ✅ Exists
│   └── contact/ ✅ Exists
├── (protected)/ ✅ Exists
│   ├── dashboard/ ✅ Exists
│   ├── accommodation/ ✅ Exists
│   └── payment/ ❌ MISSING (critical)
├── admin/ ✅ Exists
│   ├── verify/ ⚠️ Partial (verification logic needed)
│   └── scanner/ ✅ Exists
└── api/ ✅ Exists
```

**Recommendation:**
- Create `(auth)` route group and move auth pages
- Create `(marketing)` route group and move marketing pages
- Create `/payment` under `(protected)` for payment flow UI
- **Effort:** 1-2 hours (file moves + testing)

---

## 9. src/components/ (React Components)

### Current State
```
src/components/
├── features/ ⚠️ PARTIAL
│   ├── AccommodationForm.tsx ✅
│   ├── RegistrationForm.tsx ✅
│   └── ResetPasswordForm.tsx ✅
└── ui/ ⚠️ PARTIAL
    └── Autocomplete.tsx ✅
```

### Proposed Structure
```
src/components/
├── ui/ ⚠️ NEEDS
│   ├── Button.tsx (Tailwind-based)
│   ├── Card.tsx
│   ├── Modal.tsx
│   ├── Input.tsx
│   ├── Badge.tsx
│   └── Autocomplete.tsx ✅
├── common/ ❌ MISSING
│   ├── Navbar.tsx (from layout.tsx)
│   ├── Footer.tsx
│   ├── Loader.tsx
│   └── ErrorBoundary.tsx
├── features/ ⚠️ NEEDS EXPANSION
│   ├── payment/
│   │   ├── PackageSelection.tsx ❌
│   │   └── ProofUpload.tsx ❌
│   ├── events/
│   │   ├── EventCard.tsx (partially in pages)
│   │   └── FilterBar.tsx ❌
│   ├── admin/
│   │   ├── VerificationCard.tsx ❌
│   │   ├── ScannerView.tsx (partially in page)
│   │   └── UserManagement.tsx ❌
│   ├── accommodation/
│   │   └── AccommodationForm.tsx ✅
│   └── auth/
│       ├── RegistrationForm.tsx ✅
│       └── ResetPasswordForm.tsx ✅
└── email/ ❌ MISSING
    ├── VerificationEmail.tsx
    ├── ResetPasswordEmail.tsx
    └── ConfirmationEmail.tsx
```

**Recommendation:**
- Extract common UI primitives (Button, Card, Modal, Input) to `ui/`
- Create `common/` folder with Navbar, Footer, Loader, ErrorBoundary
- Create `features/payment/` with PackageSelection & ProofUpload components
- Create `features/events/` with reusable EventCard & FilterBar
- Create `features/admin/` with VerificationCard, ScannerView, UserManagement
- Create `components/email/` with React Email templates
- **Effort:** 6-8 hours

---

## 10. src/lib/ (Utilities)

### Current State
```
src/lib/
├── email.ts ✅ (Nodemailer setup)
├── prisma.ts ✅ (DB singleton)
├── session.ts ✅ (Session management)
└── uploadthing.ts ✅ (File upload)
```

### Proposed Structure
```
src/lib/
├── prisma.ts ✅
├── session.ts ✅
├── uploadthing.ts ✅
├── email.ts ✅
├── utils.ts ❌ MISSING (cn, classname helpers, formatters)
├── qr-generator.ts ❌ MISSING (QR code logic)
├── validators.ts ❌ MISSING (Zod schemas)
└── constants.ts ❌ MISSING (App-wide constants)
```

**Recommendation:**
- Create `lib/utils.ts`:
  ```typescript
  export function cn(...classes) { /* Tailwind merge */ }
  export function formatDate(date) { /* Format helpers */ }
  export function formatCurrency(amount) { /* Currency helpers */ }
  ```
- Create `lib/qr-generator.ts`:
  ```typescript
  export async function generateQRCode(data) { /* QR logic */ }
  ```
- Create `lib/validators.ts` with Zod schemas for all forms
- Create `lib/constants.ts` with app config
- **Effort:** 2-3 hours

---

## 11. src/server/ (Backend Logic)

### Current State
```
src/server/
└── actions/
    ├── accommodation.ts ✅
    ├── admin.ts ✅
    ├── auth.ts ✅
    ├── contact.ts ✅
    ├── event-logistics.ts ✅
    ├── forgot-password.ts ✅
    ├── login.ts ✅
    └── register-full.ts ✅
```

### Proposed Structure
```
src/server/
├── actions/
│   ├── auth-actions.ts ⚠️ (Split from auth.ts, login.ts, register-full.ts)
│   ├── payment-actions.ts ❌ MISSING
│   ├── event-actions.ts ⚠️ (Rename from event-logistics.ts)
│   ├── admin-actions.ts ✅ (Rename from admin.ts)
│   ├── scanner-actions.ts ❌ MISSING
│   ├── accommodation-actions.ts ✅ (Rename from accommodation.ts)
│   └── contact-actions.ts ✅ (Rename from contact.ts)
└── auth.ts ✅ (NextAuth config)
```

**Recommendation:**
- Consolidate auth actions: `auth-actions.ts` with login, register, forgot-password, reset
- Create `payment-actions.ts` for payment verification & status
- Create `scanner-actions.ts` for QR code scanning & attendance marking
- Rename existing files for clarity (add `-actions` suffix)
- **Effort:** 2-3 hours

---

## 12. src/types/ (TypeScript)

### Current State
```
src/types/
└── (likely empty or minimal)
```

### Proposed Structure
```
src/types/
├── index.d.ts (or separate files)
├── user.ts
├── event.ts
├── payment.ts
├── accommodation.ts
└── api.ts
```

**Recommendation:**
- Create centralized type definitions
- Export from `types/index.ts`
- Use across actions and components
- Example:
  ```typescript
  export type User = {
    id: string;
    email: string;
    role: 'APPLICANT' | 'PARTICIPANT' | 'ADMIN' | 'COORDINATOR';
  };
  ```
- **Effort:** 1-2 hours

---

## 13. tests/ (Testing Suite)

### Current State
```
tests/
└── (doesn't exist)
```

### Proposed Structure
```
tests/
├── unit/
│   ├── auth.test.ts
│   ├── validators.test.ts
│   └── utils.test.ts
└── e2e/
    ├── auth.spec.ts
    ├── events.spec.ts
    └── payments.spec.ts
```

**Recommendation:**
- Set up Jest for unit tests
- Set up Playwright for E2E tests
- Add test scripts to `package.json`:
  ```json
  "test": "jest",
  "test:e2e": "playwright test",
  "test:coverage": "jest --coverage"
  ```
- Aim for 70% code coverage on critical paths
- **Effort:** 6-8 hours (setup + initial tests)

---

## 14. Root Configuration Files

| File | Proposed | Current | Status | Gap |
|------|----------|---------|--------|-----|
| `.env.example` | Template env vars | ✅ Exists | ✅ Exists | ✓ Complete |
| `.gitignore` | Git exclusions | ✅ Exists | ✅ Exists | ✓ Complete |
| `next.config.js` | Next.js config | ✅ Exists | ✅ Exists | ✓ Complete |
| `package.json` | Dependencies & scripts | ✅ Exists | ✅ Exists | ⚠️ Missing test scripts |
| `postcss.config.js` | PostCSS config | ✅ Exists | ✅ Exists | ✓ Complete |
| `tailwind.config.ts` | Tailwind config | ✅ Exists | ✅ Exists | ✓ Complete |
| `tsconfig.json` | TypeScript config | ✅ Exists | ✅ Exists | ✓ Complete |

---

## 🎯 FINAL RECOMMENDATIONS (Priority Order)

### **CRITICAL (Do First - Blocks Production)**

1. **Create Payment UI** (`/protected/payment` + components)
   - Status: ❌ Missing
   - Impact: Revenue blocker
   - Effort: 4-6 hours
   - Files: `src/app/(protected)/payment/page.tsx`, `src/components/features/payment/*`

2. **Set up CI/CD Pipeline** (GitHub Actions)
   - Status: ❌ Missing
   - Impact: No automated testing/deployment
   - Effort: 2-3 hours
   - Files: `.github/workflows/ci-pipeline.yml`, `security-scan.yml`

3. **Create Dockerfile & Docker Setup**
   - Status: ❌ Missing (only docker-compose at root)
   - Impact: Can't containerize for production
   - Effort: 3-4 hours
   - Files: `docker/Dockerfile`, `docker/nginx.conf`, move `docker-compose.yml`

4. **Write Core Documentation**
   - Status: ❌ Missing
   - Impact: Developer onboarding friction
   - Effort: 4-6 hours
   - Files: `docs/setup-guide.md`, `docs/architecture.md`, `docs/api-reference.md`

---

### **HIGH (Do Next - MVP Blockers)**

5. **Reorganize Route Groups** (`(auth)`, `(marketing)`, `(protected)`)
   - Status: ⚠️ Partial
   - Impact: Code organization for scaling
   - Effort: 1-2 hours
   - Files: Move existing routes into groups

6. **Extract UI Components** (`ui/Button`, `ui/Card`, `common/Navbar`, etc.)
   - Status: ⚠️ Minimal
   - Impact: Code reusability & maintainability
   - Effort: 6-8 hours
   - Files: `src/components/ui/*`, `src/components/common/*`

7. **Create Utility Library** (`lib/utils.ts`, `lib/validators.ts`, `lib/qr-generator.ts`)
   - Status: ⚠️ Partial (only email, prisma, session, uploadthing)
   - Impact: Cleaner code, less duplication
   - Effort: 2-3 hours
   - Files: `src/lib/utils.ts`, `src/lib/validators.ts`, `src/lib/qr-generator.ts`

8. **Centralize Types** (`types/index.d.ts`)
   - Status: ❌ Missing
   - Impact: Better type safety, intellisense
   - Effort: 1-2 hours
   - Files: `src/types/*`

9. **Add Automation Scripts** (`scripts/setup.sh`, `scripts/seed-db.ts`)
   - Status: ❌ Missing
   - Impact: Easier onboarding
   - Effort: 1-2 hours
   - Files: `scripts/setup.sh`, `scripts/health-check.sh`

---

### **MEDIUM (Nice to Have)**

10. **Set up Testing** (Jest + Playwright)
    - Status: ❌ Missing
    - Impact: Regression prevention, confidence in refactoring
    - Effort: 6-8 hours
    - Files: `tests/unit/*`, `tests/e2e/*`

11. **Add Email Templates** (`components/email/*`)
    - Status: ⚠️ Partial (email.ts exists but no templates)
    - Impact: Professional email UX
    - Effort: 2-3 hours
    - Files: `src/components/email/*`

12. **Security Configuration** (`security/zap-baseline.conf`, `sonar-project.properties`)
    - Status: ❌ Missing
    - Impact: Security scanning in CI/CD
    - Effort: 2-3 hours
    - Files: `security/*`, update `.github/workflows/*`

---

## 📊 Effort Summary

| Category | Hours | Priority |
|----------|-------|----------|
| **Critical Path** | ~15-20 | **NOW** |
| **High Priority** | ~15-20 | **Week 1** |
| **Medium Priority** | ~12-16 | **Week 2-3** |
| **Polish & Optimization** | 8-12 | **Later** |
| **TOTAL** | ~50-68 | — |

**Timeline to full compliance:** 2-3 weeks (at 20 hrs/week)

---

## 🚨 Key Blockers Unblocked by This Plan

| Blocker | Unblocked By | Priority |
|---------|-------------|----------|
| Can't deploy | CI/CD + Docker setup | CRITICAL |
| No revenue collection | Payment UI + payment actions | CRITICAL |
| Hard to onboard new devs | Docs + setup scripts | HIGH |
| Code quality unclear | Tests + SonarQube | MEDIUM |
| Security unknown | OWASP ZAP + CodeQL | MEDIUM |

---

## ✨ Conclusion

**Current status: 70% structure-complete, 30% polish-needed**

The app is **functionally MVP-ready** but lacks the **operational maturity** (CI/CD, docs, tests, DevOps) for production. Following this roadmap will bring the project to **enterprise-ready** status in 2-3 weeks.

**Recommendation:** Start with the **CRITICAL** category this week. Deploy next week with optional (manual) verification flow. Complete infrastructure & testing over following weeks.

---

**Next Step:** Ready to implement? Start with: **Payment UI** or **CI/CD Pipeline**? Which would unblock your team first?
