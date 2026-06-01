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

Built with modern web technologies, the platform supports multi-year operations, background job processing, resilient infrastructure, and secure access controls. It is designed to be easily configurable and deployable for any college-level technical or cultural fest.

---

## 🏗 Architecture & Tech Stack

This project is built using a modern **TypeScript** full-stack ecosystem, optimized for performance and maintainability.

### 1. Frontend Architecture
- **Framework**: [Next.js (App Router)](https://nextjs.org/) for server-side rendering (SSR), static site generation (SSG), and API routes.
- **Language**: [TypeScript](https://www.typescriptlang.org/) for strong type safety across the stack.
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) combined with `shadcn/ui` components for beautiful, responsive, and accessible UI.
- **State Management**: React Hooks (useState, useEffect, useCallback) for local state, and Server Actions for data mutations.

### 2. Backend Architecture
- **API & Logic**: Next.js Server Actions provide seamless RPC-like calls from the client to the server, ensuring type safety without boilerplate.
- **Authentication**: [NextAuth.js v5 (Beta)](https://authjs.dev/) utilizing Credentials and JWT strategies for secure, session-less authentication. Includes Role-Based Access Control (RBAC).

### 3. Database & Data Access
- **Primary Database**: [PostgreSQL 15](https://www.postgresql.org/) handles relational data integrity (Users, Teams, Events, Marks).
- **ORM**: [Prisma](https://www.prisma.io/) provides a strongly typed database client and schema migrations.
- **Caching & Rate Limiting**: [Redis](https://redis.io/) (via Upstash Redis) is used for distributed rate-limiting to protect endpoints (e.g., registrations, invites) and for queue management.

### 4. Background Jobs & Asynchronous Processing
- **Queue System**: [BullMQ](https://docs.bullmq.io/) is used for reliable, Redis-backed job queues.
- **Background Workers**: A dedicated Node.js worker process (`qr.worker.ts`, etc.) handles heavy, asynchronous tasks like:
  - QR Code Generation
  - CSV Exports
  - ID Card Generation (PDF/ZIP)
  This ensures the main web server remains responsive during computationally intensive operations.

### 5. Storage & Media Management
- **Object Storage**: [DigitalOcean Spaces](https://www.digitalocean.com/products/spaces) (S3-Compatible) is used for storing generated QR codes, ID cards, and user uploads.
- **Local Fallback**: A local filesystem storage provider is included for seamless local development without cloud credentials.

### 6. Real-Time Communication
- **Server-Sent Events (SSE)**: Used to broadcast real-time updates (e.g., live leaderboard updates during marking) to connected clients without heavy polling.

### 7. Tooling & CI/CD
- **Testing**: [Vitest](https://vitest.dev/) for unit and integration testing. [Playwright](https://playwright.dev/) for End-to-End (E2E) testing.
- **Containerization**: [Docker](https://www.docker.com/) with multi-stage builds ensures environment parity between development and production.
- **Pipelines**: GitHub Actions automate Linting, Typechecking, Testing, and Deployment.

---

## ✨ Key Features

- **🛡️ Role-Based Access Control (RBAC)**: Fine-grained permissions spanning `APPLICANT`, `PARTICIPANT`, `VOLUNTEER`, `COORDINATOR`, and `ADMIN`.
- **📱 Mobile-First QR Scanning**: Integrated HTML5 QR code scanning for fast, secure event attendance and kit distribution.
- **⚙️ Multi-Year Architecture**: Designed to run continuously across multiple years. "Yearly Editions" allow seamless data archiving and event cloning without losing historical records.
- **✉️ Transactional Emails**: Automated email confirmations for registrations, team locks, and payment verification via Resend.
- **🚀 Progressive Web App (PWA)**: Installable on mobile devices with service worker caching for offline resilience.

---

## 💻 Local Development & Configuration

### Prerequisites
- Node.js `20.x`
- Docker & Docker Compose (for local DB/Redis)
- Git

### 1. Environment Setup
Clone the repository and set up your environment variables. A `.env.example` file is provided in the root directory.
```bash
git clone https://github.com/Aravind6626/shackles-next.git
cd shackles-next
cp .env.example .env.local
```
*Open `.env.local` and configure your settings. The defaults are set up to work with the local Docker containers.*

### 2. Start Infrastructure
Spin up the local PostgreSQL database and Redis instance using Docker Compose:
```bash
docker-compose up -d db redis
```

### 3. Database Initialization & Seeding
Push the Prisma schema to the database and seed it with initial data (users, events, settings):
```bash
npm install
npx prisma db push
npx prisma db seed
```
*(Note: If you have no data in your DB, running `npx prisma db seed` is crucial to populate the initial admin user and template events).*

### 4. Run the Application
Start the Next.js development server:
```bash
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

### 2. Year Switch Configuration
Set yearly controls through your `.env.local` variables during rollover:
- `ACTIVE_YEAR`: The active public year scope (e.g., `2027`).
- `ACTIVE_THEME_KEY`: Visual theme key (`default`, `classic`, `future`).

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

> **Note**: This repository represents a specialized implementation for college symposiums. If you plan to fork this for your own institution, ensure you update the branding, email templates, and environment configurations.
