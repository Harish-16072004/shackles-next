/**
 * scripts/generate-pwa-icons.ts
 *
 * Generates the required PWA PNG icons from public/pwa-icon.svg using sharp.
 * Run with:  npx tsx scripts/generate-pwa-icons.ts
 *
 * Output (placed in public/icons/):
 *   icon-192.png           — 192×192  purpose: any
 *   icon-512.png           — 512×512  purpose: any
 *   icon-512-maskable.png  — 512×512  purpose: maskable (10% safe-zone padding)
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

const ROOT = process.cwd();
const SRC_SVG = path.join(ROOT, "public", "pwa-icon.svg");
const OUT_DIR = path.join(ROOT, "public", "icons");

/** Background fill for maskable icons (matches manifest theme_color) */
const MASKABLE_BG = "#111827";

if (!fs.existsSync(SRC_SVG)) {
  console.error(`[pwa-icons] Source SVG not found: ${SRC_SVG}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

type IconSpec = {
  filename: string;
  size: number;
  maskable?: boolean;
};

const ICONS: IconSpec[] = [
  { filename: "icon-192.png",          size: 192 },
  { filename: "icon-512.png",          size: 512 },
  { filename: "icon-512-maskable.png", size: 512, maskable: true },
];

async function generateIcon({ filename, size, maskable = false }: IconSpec) {
  const outPath = path.join(OUT_DIR, filename);

  if (maskable) {
    // Maskable: 10% safe-zone — icon occupies 80% of canvas, centred on bg fill
    const iconSize = Math.round(size * 0.8);
    const padding  = Math.round((size - iconSize) / 2);

    const resized = await sharp(SRC_SVG)
      .resize(iconSize, iconSize)
      .png()
      .toBuffer();

    await sharp({
      create: {
        width:      size,
        height:     size,
        channels:   4,
        background: MASKABLE_BG,
      },
    })
      .composite([{ input: resized, top: padding, left: padding }])
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  } else {
    await sharp(SRC_SVG)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outPath);
  }

  console.log(`[pwa-icons] ✓ ${filename} (${size}×${size}${
    maskable ? " maskable" : ""
  })`);
}

(async () => {
  console.log("[pwa-icons] Generating PWA icons from", SRC_SVG);
  await Promise.all(ICONS.map(generateIcon));
  console.log("[pwa-icons] Done. Files written to", OUT_DIR);
})();
