# ============================================================
# Stage 1 — deps: install production + dev deps for the build
# ============================================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps

# Native module build tools (sharp, onnxruntime-node, bcryptjs)
RUN apk add --no-cache libc6-compat python3 make g++ openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --legacy-peer-deps

# ============================================================
# Stage 2 — builder: compile the Next.js app (standalone output)
# ============================================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for the target platform
RUN npx prisma generate

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time dummy values so Next.js config evaluation does not throw.
# Real secrets are injected at runtime via environment variables.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV DIRECT_DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV SESSION_SECRET=placeholder-build-time-only-not-used-in-production-long-secret
ENV ACTIVE_YEAR=2026
ENV ACTIVE_THEME_KEY=shackles
ENV ACTIVE_PUBLIC_DOMAIN=localhost
ENV NEXT_PUBLIC_APP_URL=http://localhost:3000

RUN npx next build --webpack

# ============================================================
# Stage 3 — runner: lean production image
# ============================================================
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Enable Next.js built-in graceful shutdown for standalone mode
ENV NEXT_PRIVATE_STANDALONE_GRACEFUL_SHUTDOWN=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Public assets (PWA manifests, service-worker, icons)
COPY --from=builder /app/public ./public

# Standalone server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Static assets (JS chunks, CSS, images)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Additional files for background worker (package.json only)
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Install openssl for Prisma runtime
RUN apk add --no-cache openssl

USER nextjs

EXPOSE 3000

# Health-check: verifies the HTTP server is responding.
# The /api/health route also pings the DB — a failing DB will return 503.
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
