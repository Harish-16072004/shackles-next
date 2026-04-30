# PWA Icon Generation

The app manifest (`public/manifest.json`) references PNG icons that must be
generated from the SVG source before deployment.

## One-command generation

```bash
npx pwa-asset-generator public/pwa-icon.svg public/icons \
  --background "#111827" \
  --padding "10%" \
  --type png
```

This produces:
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-512-maskable.png` (add `--maskable` flag)

## Manual generation (alternative)

Use any SVG-to-PNG tool (e.g., Inkscape, Figma export, or `sharp`):

```ts
// scripts/generate-pwa-icons.ts
import sharp from 'sharp';
import path from 'path';

const src = path.resolve('public/pwa-icon.svg');
const dest = path.resolve('public/icons');

await sharp(src).resize(192, 192).toFile(`${dest}/icon-192.png`);
await sharp(src).resize(512, 512).toFile(`${dest}/icon-512.png`);
await sharp(src).resize(512, 512).toFile(`${dest}/icon-512-maskable.png`);

console.log('PWA icons generated.');
```

Run with:
```bash
npx tsx scripts/generate-pwa-icons.ts
```

## Offline fallback

The service worker (`public/sw.js`) will cache `public/offline.html` as the
fallback page when a navigation request fails while offline.

Verify the offline fallback is registered by checking `sw.js` for a cache
entry pointing to `/offline.html`.
