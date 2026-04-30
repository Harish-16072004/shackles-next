# Security Documentation

## Overview

This document describes the security architecture and practices implemented in Shackles Symposium.

## Authentication (Auth.js v5)

### Session Management

The application uses **Auth.js v5** with **database sessions** for secure, stateless authentication.

**Key Points:**
- Sessions are stored in the PostgreSQL `Session` table (managed by `@auth/prisma-adapter`)
- Credentials provider: Email + password authentication via bcryptjs password hashing
- Session duration: 7 days with daily update checks
- HTTPOnly cookies prevent XSS attacks
- SameSite=Lax prevents CSRF attacks

**User Roles:**
- `APPLICANT`: Default role for new registrations
- `PARTICIPANT`: Active event participant
- `COORDINATOR`: Event coordinator/staff
- `ADMIN`: Full administrative access

### Protected Routes

**Middleware-based Protection** (`src/middleware.ts`):
- `/admin/*` → Requires ADMIN role
- `/(protected)/*` → Requires authentication

**Server Action Protection** (`src/server/actions/*`):
- Check session exists: `getSession()`
- Enforce admin role: `requireAdmin()`
- Enforce logged-in: `requireSession()`

**API Route Protection** (`src/app/api/*`):
- Check session via `getSession()`
- Return 401 if unauthorized
- Return 403 if insufficient permissions

### Password Security

- Passwords hashed with **bcryptjs** (10 salt rounds)
- Never store plaintext passwords
- Session secret: min 32 characters (enforce via Zod validation)
- Environment variable validation at app startup ensures SESSION_SECRET meets requirements

## Environment Variable Validation

All environment variables are validated at app startup using **Zod schemas** (`src/lib/env-validation.ts`).

**Validation Benefits:**
- Prevents app startup with missing critical configuration
- Type-safe access to environment variables
- Clear error messages for misconfiguration
- Automated checking in CI/CD pipelines

**Validated Variables:**
- **Core (Required):** DATABASE_URL, SESSION_SECRET, STORAGE_PROVIDER, NEXT_PUBLIC_APP_URL
- **Production (Required in production):** ACTIVE_YEAR, ACTIVE_THEME_KEY, ACTIVE_PUBLIC_DOMAIN
- **Conditional (If enabled):** DigitalOcean Spaces credentials, SMTP settings
- **Optional (With warnings):** PINECONE_API_KEY (AI features degraded if missing)

## Rate Limiting

Rate limiting prevents abuse of sensitive endpoints using **@upstash/ratelimit**.

### Rate Limit Presets

| Endpoint | Limit | Window |
|----------|-------|--------|
| Chat/AI | 50 requests | 24 hours |
| Event Registration | 10 attempts | 1 hour |
| File Uploads | 5 uploads | 1 hour |
| Offline Sync | 20 operations | 1 hour |
| Admin CSV Import | 2 imports | 1 hour |

### Implementation

**Fallback Strategy:**
- **Production:** Upstash Redis distributed rate limiting
- **Development:** In-memory rate limiting (no Redis required)

**Configuration:**
```typescript
const chatLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 50,
  keyPrefix: "api:chat",
});
```

**Response Headers:**
```
x-ratelimit-limit: 50
x-ratelimit-remaining: 49
retry-after: 3600
```

## Input Validation

All API routes and server actions validate input using **Zod schemas**.

**Pattern:**
```typescript
const inputSchema = z.object({
  eventId: z.string().uuid(),
  action: z.enum(["create", "update", "delete"]),
});

const validationResult = inputSchema.safeParse(body);
if (!validationResult.success) {
  return NextResponse.json(
    { error: "Invalid input", details: validationResult.error.flatten() },
    { status: 400 }
  );
}
```

**Benefits:**
- Type-safe request handling
- Automatic validation errors
- Protection against injection attacks
- Clear error messages to clients

## Database Security

### Connection Pooling

Prevent connection exhaustion with PgBouncer connection pooling:

```
DATABASE_URL=postgresql://user:pass@host/db?pgbouncer=true&connection_limit=10&pool_timeout=30
```

### Soft Deletes / Archiving

- Old data is archived annually via `npm run archive:year:export`
- Stale records cleaned via `npm run db:cleanup` (removes records 2+ years old)
- No permanent deletion of user data without explicit archival first

### Audit Logging

- All registration changes logged to audit table
- Admin actions tracked by user and timestamp
- Export audits via `/api/admin/csv/audit/export`

## Data Privacy

### User Data Collection

- Required: Email, name, phone, college information
- Optional: Social links, accommodation preferences
- QR tokens generated for attendance tracking (revokable)

### Data Retention

- Current + 2 previous years retained
- Older data archived to cold storage
- Cleanup script removes orphaned records from archived years

### GDPR / Privacy Compliance

- Users can request account deletion (admin-initiated)
- Audit trail preserved for compliance
- Encryption in transit (HTTPS enforced in production)
- No third-party data sharing without consent

## Third-Party Services

### Pinecone (Vector Search)

- Optional: Enable with `PINECONE_API_KEY`
- Used for AI event recommendations only
- Not required for core functionality
- Events are embedded and uploaded on-demand

### DigitalOcean Spaces (File Storage)

- Optional: Set `STORAGE_PROVIDER=digitalocean`
- Alternative: Local filesystem storage
- Credentials required: `DO_SPACES_KEY`, `DO_SPACES_SECRET`
- CDN URL optional but recommended: `DO_SPACES_CDN_BASE_URL`

### SMTP (Email Sending)

- Used for account reset links and invitations
- Credentials: `SMTP_USER`, `SMTP_PASS`
- In development, reset links logged to console instead of sent
- TLS/STARTTLS configurable via `SMTP_SECURE`

## Deployment Security

### Environment Configuration

1. **Before Deployment:**
   - Run `npm run build` (validates TypeScript, auth, routes)
   - Set all required environment variables
   - Run database migrations: `npm run db:migrate:prod`
   - Seed admin user: `npm run db:seed`

2. **Validation:**
   - App startup automatically validates all env vars
   - Misconfigurations prevent server from starting
   - Clear error logs identify problems

3. **Secrets Management:**
   - Store SESSION_SECRET in secure vault (not in .env)
   - Rotate PINECONE_API_KEY periodically
   - Monitor database logs for unauthorized access

### Production Checklist

- [ ] `NODE_ENV=production` set
- [ ] `SESSION_SECRET` strong (32+ chars) and secret
- [ ] Database connection pooling enabled
- [ ] Redis/Upstash configured for distributed rate limiting
- [ ] HTTPS enforced at reverse proxy
- [ ] CORS properly configured if serving API separately
- [ ] Regular backups of PostgreSQL database
- [ ] Monitoring alerts set up for failed authentications
- [ ] Audit logs monitored for suspicious activity

## Security Best Practices

### For Developers

1. **Use Session Wrapper:** Always use `getSession()` from `@/lib/session.ts`
2. **Validate All Input:** Add Zod schemas to new endpoints
3. **Apply Rate Limiting:** Use `createRateLimiter()` for sensitive endpoints
4. **Handle Errors Safely:** Never expose stack traces to clients in production
5. **Follow Architecture Boundaries:** Business logic in services, not routes

### For Admins

1. **Regular Backups:** Daily automated database backups to cold storage
2. **Audit Logs:** Review admin audit log monthly
3. **Access Control:** Limit ADMIN role grants to trusted users
4. **Environment Secrets:** Store in secure vault, rotate periodically
5. **Updates:** Keep dependencies updated, monitor security advisories

## Incident Response

### Suspected Breach

1. Immediately revoke compromised API keys
2. Force password reset for affected users
3. Review audit logs for unauthorized actions
4. Snapshot database and preserve for forensics
5. Notify affected users within 24 hours

### Rate Limit Abuse

- Automatic: Request rejected with 429 status
- Monitor: Check Redis rate limit metrics
- Manual: Admin can increase limits for legitimate high-volume users

## References

- [Auth.js Documentation](https://authjs.dev)
- [Zod Validation](https://zod.dev)
- [Upstash Rate Limiting](https://upstash.com/docs/redis/features/ratelimiting)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
