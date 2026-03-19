import path from "node:path";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import sharp from "sharp";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getStorageProvider } from "@/lib/storage-provider";
import { getSpacesClient } from "@/lib/digitalocean/spaces";
import { getRequiredEnv } from "@/lib/env";

// ─── Card dimensions at 300 PPI ──────────────────────────────────────────────
// 6.3 cm × (300 / 2.54) = 744 px
// 8.5 cm × (300 / 2.54) = 1004 px
export const CARD_W = 744;
export const CARD_H = 1004;

// ─── Text overlay ─────────────────────────────────────────────────────────────
// Shackles ID sits just above the photo box (~57 % from top)
const TEXT_Y = 575;
const TEXT_FONT_SIZE = 44;
const TEXT_COLOR = "#1a1a2e";

// ─── QR / photo box — 2.5 × 2.5 cm @ 300 PPI ────────────────────────────────
// 2.5 cm × (300 / 2.54) ≈ 295 px
// Centred horizontally.
// Bottom margin derived from annotated design (23.08 px ≈ 6.8 % of card height)
// → QR top = CARD_H − bottom_margin_px − QR_SIZE
const QR_SIZE = Math.round((2.5 / 2.54) * 300);        // 295 px
const BOTTOM_MARGIN = Math.round(CARD_H * 0.068);       // ≈ 68 px
const QR_X = Math.round((CARD_W - QR_SIZE) / 2);       // centred horizontally
const QR_Y = CARD_H - BOTTOM_MARGIN - QR_SIZE;         // ≈ 641 px from top

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "templates",
  "id-card-template.png"
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Stream a Readable into a Buffer */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Download a QR code PNG from DigitalOcean Spaces using the S3 SDK.
 * @param key  Full object key as stored in DO Spaces (e.g. "qr-codes/2026/01/general/SH26GN001.png")
 */
async function fetchQrFromSpaces(key: string): Promise<Buffer | null> {
  try {
    const bucket = getRequiredEnv("DO_SPACES_BUCKET");
    const client = getSpacesClient();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    return streamToBuffer(res.Body as Readable);
  } catch (err) {
    console.warn("[id-cards] DO fetch failed for key:", key, (err as Error).message);
    return null;
  }
}

/**
 * Resolves the QR code PNG into a Buffer.
 *
 * Priority:
 *  1. DigitalOcean Spaces  — when STORAGE_PROVIDER=digitalocean and qrPath is set
 *  2. Local filesystem     — when STORAGE_PROVIDER=local and qrPath is set
 *  3. Remote URL fallback  — qrImageUrl (external QR generator API, etc.)
 */
export async function resolveQrBuffer(
  qrPath?: string | null,
  qrImageUrl?: string | null
): Promise<Buffer | null> {
  try {
    const provider = getStorageProvider();

    if (qrPath) {
      if (provider === "digitalocean") {
        // qrPath may be stored as "/uploads/qr-codes/..." (local style) or as
        // the bare Spaces key "qr-codes/2026/...". Normalise to just the key part.
        const key = qrPath
          .replace(/^\/+/, "")                     // strip leading slashes
          .replace(/^uploads\//, "");               // strip "uploads/" prefix if present
        const buf = await fetchQrFromSpaces(key);
        if (buf) return buf;
      } else {
        // Local — read from public/
        const absPath = path.join(
          process.cwd(),
          "public",
          qrPath.replace(/^\//, "")
        );
        return await fs.readFile(absPath);
      }
    }

    // Fallback: fetch from URL (covers external QR generator API for older records)
    if (qrImageUrl) {
      const res = await fetch(qrImageUrl);
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    }
  } catch (err) {
    console.warn("[id-cards] resolveQrBuffer failed:", (err as Error).message);
  }
  return null;
}

/**
 * Composites a single ID card at 300 PPI.
 *
 * @param shacklesId  e.g. "SH26GN001"
 * @param qrBuffer    PNG buffer of the participant's QR code (null → blank box)
 * @returns           PNG Buffer at CARD_W × CARD_H px
 */
export async function composeCard(
  shacklesId: string,
  qrBuffer: Buffer | null
): Promise<Buffer> {
  // Resize template to exact card dimensions
  const templateBuffer = await sharp(TEMPLATE_PATH)
    .resize(CARD_W, CARD_H, { fit: "fill" })
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];

  // ── 1. Shackles ID text (SVG overlay) ──────────────────────────────────────
  const svgText = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">
      <text
        x="${CARD_W / 2}"
        y="${TEXT_Y}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${TEXT_FONT_SIZE}"
        font-weight="bold"
        text-anchor="middle"
        letter-spacing="3"
        fill="${TEXT_COLOR}"
      >${shacklesId}</text>
    </svg>`
  );
  composites.push({ input: svgText, top: 0, left: 0 });

  // ── 2. QR code — 2.5 × 2.5 cm box, centred horizontally ──────────────────
  if (qrBuffer) {
    const resizedQr = await sharp(qrBuffer)
      .resize(QR_SIZE, QR_SIZE, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toBuffer();
    composites.push({ input: resizedQr, top: QR_Y, left: QR_X });
  }

  return sharp(templateBuffer).composite(composites).png().toBuffer();
}
