# Deployment Guide: Shackles Symposium

This application is containerized and designed for deployment on any VPS (DigitalOcean, AWS, Linode, etc.) using Docker Compose.

## 📋 Prerequisites
- **Docker** & **Docker Compose** installed on the server.
- **OpenSSL** installed (for local key generation).
- A domain name (optional but recommended for SSL).

## 🚀 One-Click Deployment (Quick Start)

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd shackles_symposium
   ```

2. **Setup Environment Variables**:
   Create a `.env` file in the root directory. You can use `.env.example` as a template.
   ```bash
   cp .env.example .env
   ```
   **Important**: Ensure `NEXTAUTH_SECRET` and `SESSION_SECRET` are long random strings.
   ```bash
   # Generate a secret
   openssl rand -base64 32
   ```

3. **Build and Start**:
   ```bash
   docker-compose up --build -d
   ```

4. **Initialize Database**:
   Run migrations inside the running container:
   ```bash
   docker exec -it shackles-app npx prisma migrate deploy
   ```

## 🏗️ Architecture
- **App (`shackles-app`)**: Next.js production server (Standalone mode).
- **Worker (`shackles-worker`)**: Background job processor for heavy tasks (QR generation, CSV exports).
- **Database (`shackles-local-db`)**: PostgreSQL 16.
- **Cache (`shackles-local-redis`)**: Redis 7 for BullMQ and rate-limiting.

## 🔑 Key Configuration
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Connection string for Postgres. In Docker, use `postgresql://postgres:password@db:5432/shackles_local`. |
| `REDIS_URL` | Connection string for Redis. In Docker, use `redis://redis:6379`. |
| `NEXTAUTH_URL` | The public URL of your app (e.g., `https://shackles.yourdomain.com`). |
| `STORAGE_PROVIDER` | Set to `spaces` for DigitalOcean or `local` for container storage. |

## 🛠️ Production Best Practices

### SSL / HTTPS
It is highly recommended to use a reverse proxy like **Nginx** or **Caddy** with Let's Encrypt to handle SSL.
Example Caddyfile:
```caddy
shackles.yourdomain.com {
    reverse_proxy localhost:3000
}
```

### Database Backups
Since the database is running in a container, ensure the `postgres_data` volume is backed up regularly.
```bash
docker exec shackles-local-db pg_dumpall -U postgres > backup.sql
```

### Resource Management
Monitor memory usage, especially for the `worker` service if processing large CSV files.
```bash
docker stats
```

## 🔄 Updates
To deploy updates from your repository:
```bash
git pull
docker-compose up --build -d
docker exec -it shackles-app npx prisma migrate deploy
```

## 🔒 Branch Protection (Recommended)

Configure branch protection on `main` to prevent accidental pushes and ensure CI always gates deployments.

**Settings → Branches → Add rule → `main`:**

| Setting | Value |
|---|---|
| Require a pull request before merging | ✅ |
| Required approvals | 1 |
| Require status checks to pass | ✅ |
| Required checks | `Lint · Typecheck · Unit Tests · Build` |
| Require branches to be up to date | ✅ |
| Do not allow bypassing | ✅ |
| Restrict force pushes | ✅ |

Or via GitHub CLI:
```bash
gh api repos/{owner}/{repo}/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["Lint · Typecheck · Unit Tests · Build"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field restrictions=null
```
