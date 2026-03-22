# DigitalOcean Spaces Migration Plan (Shackles Symposium)

## Scope
This document is split into two separate parts:
1. **Repository migration plan** (code/config tasks)
2. **Manual tasks in DigitalOcean website** (dashboard actions to be performed by you)

---

## Part A — Repository Migration Plan (Code & Config)

### A1) Migration goal
Move file storage for:
- payment proof images
- generated QR code images

From current provider mode to **DigitalOcean Spaces** while keeping:
- existing DB schema (`proofPath`, `qrPath`)
- existing app workflow
- quick rollback using `STORAGE_PROVIDER`

### A2) Design choices
- Store **object keys** in DB, not permanent public URLs.
- Use signed URLs for private access where needed.
- Keep provider switching through one env variable.

### A3) Key format (data organization)
Use stable key prefixes:
- Payment proofs: `payment-proofs/{yyyy}/{mm}/{uuid}.{ext}`
- QR codes: `qr-codes/{yyyy}/{mm}/{registrationType}/{shacklesId}.png`

### A4) Code changes required
1. Extend storage provider type:
   - add `digitalocean` to provider union
2. Add Spaces client module:
   - initialize S3-compatible client with endpoint/region/credentials
3. Payment upload API update:
   - upload incoming proof file to Spaces
   - return key + signed URL
4. QR generation upload update:
   - upload generated QR image buffer to Spaces
5. Signed URL helper update:
   - add branch for DigitalOcean signed URLs
6. Env config update:
   - add DO variables
7. Keep local fallback intact for development

### A5) Environment variables to add
```env
STORAGE_PROVIDER=digitalocean
DO_SPACES_REGION=YOUR_REGION                # e.g. blr1, sgp1, nyc3
DO_SPACES_BUCKET=YOUR_BUCKET_NAME           # e.g. shackles-dev
DO_SPACES_ENDPOINT=https://YOUR_REGION.digitaloceanspaces.com
DO_SPACES_KEY=YOUR_ACCESS_KEY
DO_SPACES_SECRET=YOUR_SECRET_KEY
DO_SPACES_CDN_BASE_URL=                     # optional
```

### A6) Verification checklist (after implementation)
- [ ] Upload payment proof from registration form succeeds
- [ ] Object appears in `payment-proofs/...` path in Spaces
- [ ] Admin payment verification generates and uploads QR image
- [ ] Object appears in `qr-codes/...` path in Spaces
- [ ] Signed URLs work in admin/user dashboards
- [ ] `npm run lint` passes

### A7) Rollback plan
If anything breaks:
1. Set `STORAGE_PROVIDER=local`
2. Restart app
3. Continue using local uploads without DB changes

---

## Part B — Manual Steps in DigitalOcean Website (To Perform by You)

## B1) Create / choose project
1. Open DigitalOcean Control Panel
2. Create/select a project (e.g., `Shackles Symposium`)

## B2) Create a Space
1. Go to **Spaces Object Storage**
2. Click **Create a Space**
3. Choose region near your users
4. Space name example: `shackles-dev`
5. Keep files private by default (recommended)

## B3) Enable CORS for local dev + production
In Space settings, add CORS rules to allow your app origins:
- Dev origin: `http://localhost:3000`
- Production origin: your deployed domain

Recommended methods:
- `GET`, `PUT`, `POST`, `DELETE`, `HEAD`

## B4) Create API keys for Spaces
1. Go to **API** section in DigitalOcean
2. Create Spaces access key + secret
3. Save both securely (secret shown once)
4. Paste into `.env` as `DO_SPACES_KEY` and `DO_SPACES_SECRET`

## B5) Confirm endpoint and bucket details
Collect values:
- Region (e.g., `blr1`)
- Endpoint: `https://<region>.digitaloceanspaces.com`
- Bucket/Space name (e.g., `shackles-dev`)

## B6) Optional: CDN enablement
1. Enable CDN on the Space (optional)
2. Copy CDN URL
3. Set `DO_SPACES_CDN_BASE_URL` in `.env` (optional)

## B7) Create folder structure (optional pre-create)
You may pre-create placeholder objects/folders:
- `payment-proofs/`
- `qr-codes/`

(Spaces are key-based; folders are prefixes and may appear after first upload.)

## B8) Post-setup sanity check in dashboard
After app uploads files:
- Confirm objects appear under expected prefixes
- Confirm timestamps and object names match your workflow

---

## Manual Progress Tracker (Fill while doing website steps)

### Setup status
- [ ] Project selected/created
- [ ] Space created
- [ ] CORS configured
- [ ] API key and secret created
- [ ] Endpoint/region noted
- [ ] `.env` updated locally
- [ ] Optional CDN enabled

### Test status
- [ ] Payment proof upload test passed
- [ ] QR upload test passed
- [ ] Dashboard URLs render correctly

---

## Notes
- Keep Spaces keys server-side only; never expose secret in client code.
- Prefer storing object keys in DB and generating URLs dynamically.
- Use separate Spaces or prefixes per environment (`dev`, `staging`, `prod`).
