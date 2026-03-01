# Migration TODO (UploadThing -> Supabase)

## Phase A — Foundation
- [x] Create migration plan document
- [x] Create execution TODO tracker
- [x] Install `@supabase/supabase-js`
- [x] Add `src/lib/supabase/client.ts`
- [x] Add `src/lib/supabase/server.ts`
- [x] Add `.env.example` Supabase vars
- [x] Add optional Prisma fields: `Payment.proofPath`, `User.qrPath`
- [x] Run `prisma generate`
- [x] Validate with build/type check

## Phase B — Dual-write
- [x] Add provider flag `STORAGE_PROVIDER=uploadthing|supabase|dual`
- [x] Payment proof upload dual-write
- [x] QR generation upload dual-write
- [x] Add fallback behavior + error logging

## Phase C — Read-path cutover
- [x] Serve payment proofs from Supabase (signed URL)
- [x] Serve user QR from Supabase (signed URL)
- [x] Keep fallback to old URLs during migration

## Phase D — Backfill + Cleanup
- [x] Backfill script from UploadThing URLs to Supabase paths
- [x] Run backfill and verify DB updates *(script ran in apply mode; 3 legacy payment proof URLs returned 404 and could not be auto-migrated)*
- [x] Remove UploadThing UI/routes/libs
- [x] Remove UploadThing env keys
