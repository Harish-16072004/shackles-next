<div align="center">
  <h1>🔗 Shackles Symposium</h1>
  <p><strong>A Full-Stack Event Management Platform for College Symposiums</strong></p>
  <p>
    Registration • Payments • QR-Based Logistics • Team Management • Live Scoring • Admin Dashboards
  </p>
</div>

---

## 📖 Overview

**Shackles Symposium** is a robust, highly-scalable web application designed to handle the end-to-end lifecycle of college symposiums. It provides a seamless experience for applicants, participants, volunteers, coordinators, and administrators. 

Built with modern web technologies, the platform supports multi-year operations, background job processing, resilient infrastructure, and secure access controls.

---

## 🏗 Architecture & Tech Stack

This project is built using a modern **TypeScript** full-stack ecosystem, optimized for performance and maintainability.

### Core Stack
- **Framework**: [Next.js (App Router)](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Authentication**: [NextAuth.js v5 (Beta)](https://authjs.dev/) with Credentials Provider and JWT strategies.

### Database & Caching
- **Primary Database**: [PostgreSQL 15](https://www.postgresql.org/)
- **ORM**: [Prisma](https://www.prisma.io/)
- **Caching & Rate Limiting**: [Redis](https://redis.io/) (via Upstash Redis)

### Background Jobs & Logistics
- **Queue System**: [BullMQ](https://docs.bullmq.io/) (Powered by Redis)
- **Background Worker**: Dedicated Node.js worker process for heavy tasks (e.g., CSV exports, QR generation).

### Storage & Media
- **Object Storage**: [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) (S3-Compatible)
- **Image Processing**: [Sharp](https://sharp.pixelplumbing.com/) and client-side compression.

### Tooling & CI/CD
- **Testing**: [Vitest](https://vitest.dev/) (Unit/Integration) & [Playwright](https://playwright.dev/) (E2E)
- **Containerization**: [Docker](https://www.docker.com/) (Multi-stage builds)
- **Pipelines**: GitHub Actions (Lint, Typecheck, Build, Test, Deploy)
- **Deployment**: DigitalOcean App Platform (via `app.yaml` IaC)

---

## ✨ Key Features

- **🛡️ Role-Based Access Control (RBAC)**: Fine-grained permissions for users spanning `APPLICANT`, `PARTICIPANT`, `VOLUNTEER`, `COORDINATOR`, and `ADMIN`.
- **📱 Mobile-First QR Scanning**: Integrated HTML5 QR code scanning for fast, secure event attendance and kit distribution.
- **⚙️ Multi-Year Architecture**: Designed to run continuously across multiple years. "Yearly Editions" allow seamless data archiving and event cloning without losing historical records.
- **✉️ Transactional Emails**: Automated email confirmations for registrations, team locks, and payment verification via Resend & Nodemailer.
- **🚀 Progressive Web App (PWA)**: Installable on mobile devices with service worker caching for offline resilience.

---

## 💻 Local Development

### Prerequisites
- Node.js `20.x`
- Docker & Docker Compose
- Git

### 1. Environment Setup
Clone the repository and set up your environment variables:
```bash
git clone https://github.com/Aravind6626/shackles-next.git
cd shackles-next
cp .env.example .env
```
*Note: Update `.env` with your specific local or cloud credentials.*

### 2. Start Services
Spin up the local PostgreSQL database, Redis instance, and run the initial Prisma migrations:
```bash
docker-compose up -d db redis init-db
```

### 3. Install & Run
Install dependencies and start the Next.js development server (using Turbopack for faster builds):
```bash
npm install
npm run dev
```
Access the application at [http://localhost:3000](http://localhost:3000).

---

## 🔄 Yearly Edition Bootstrap

This project supports continuous multi-year operation utilizing a single database.

### 1. Clone templates to a target year
You can create active, non-template events for a new year derived from template rows:
```bash
npm run bootstrap:year -- 2027 --from=2026
```
*(Use the `--dry-run` flag to test the output before committing to the database).*

### 2. Year Switch Configuration
Set yearly controls through your environment variables during rollover:
- `ACTIVE_YEAR`: The active public year scope (e.g., `2027`).
- `ACTIVE_THEME_KEY`: Visual theme key (`default`, `classic`, `future`).
- `ACTIVE_PUBLIC_DOMAIN`: Public domain for metadata context.

### 3. Archive Operations
Export a yearly archive snapshot for safe keeping:
```bash
npm run archive:year:export -- 2026
```

---

## 🚢 Deployment

The deployment architecture consists of two primary Docker containers:
1. **`shackles-next`**: The Next.js web application (running in Standalone mode).
2. **`shackles-worker`**: The background worker processing BullMQ queues.

### DigitalOcean App Platform
This project is configured for continuous deployment to the DigitalOcean App Platform. 

To provision the infrastructure (App, Worker, Postgres DB, and Redis), authenticate with the DigitalOcean CLI (`doctl`) and run:
```bash
doctl apps create --spec app.yaml
```
GitHub Actions (`deploy.yml`) will automatically build, push, and deploy new Docker images whenever code is merged into the `main` branch.

---

## 🧪 Testing

Run the testing suites to ensure platform stability:

**Unit & Integration Tests (Vitest)**
```bash
npm run test
```

**End-to-End Tests (Playwright)**
```bash
npx playwright test
```

---

## 📜 License & Contribution

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Aravind6626/shackles-next/issues).

> **Note**: This repository represents a specialized implementation for college symposiums. If you plan to fork this for your own institution, ensure you update the branding, email templates, and DigitalOcean resource identifiers.
