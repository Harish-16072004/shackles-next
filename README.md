This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Yearly Edition Bootstrap

This project supports multi-year operation with one database.

### Seed template events

Template events are seeded with `isTemplate=true` for `ACTIVE_YEAR`.

```bash
npm run prisma db seed
```

### Clone templates to a target year

Create active, non-template events for a new year from template rows:

```bash
npm run bootstrap:year -- 2027 --from=2026
```

Dry run mode:

```bash
npm run bootstrap:year -- 2027 --from=2026 --dry-run
```

Notes:
- The command is idempotent for already-cloned template sets.
- Existing target-year events are not deleted.
- Historical years remain in the same DB and can be archived without hard deletion.

### Year switch configuration

Set yearly controls through environment variables:

- `ACTIVE_YEAR`: active public year scope
- `ACTIVE_THEME_KEY`: visual theme key (`default`, `classic`, `future`)
- `ACTIVE_PUBLIC_DOMAIN`: public domain for metadata and deployment context

At yearly rollover:

1. Seed/verify template rows for source year.
2. Run `npm run bootstrap:year -- <targetYear> --from=<sourceYear>`.
3. Update `ACTIVE_YEAR`, `ACTIVE_THEME_KEY`, `ACTIVE_PUBLIC_DOMAIN`.
4. Archive previous year events in admin events page.

Validate with tests:

```bash
npx vitest run tests/unit/edition.test.ts tests/unit/shackles-id.service.test.ts tests/integration/year-visibility.routes.test.ts tests/integration/event-archive.service.test.ts tests/integration/shackles-id.sequence.test.ts tests/integration/year-bootstrap.service.test.ts
```

### Archive operations

Export yearly archive snapshot:

```bash
npm run archive:year:export -- 2026
```

Run restore drill for one archived event in a year:

```bash
npm run archive:year:restore-drill -- 2026
```

Operational checklist and rollback workflow:

- `docs/YEARLY_ROLLOVER_RUNBOOK.md`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
