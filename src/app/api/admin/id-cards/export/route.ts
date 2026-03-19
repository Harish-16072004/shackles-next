import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { logAdminAudit } from "@/lib/admin-audit";
import { composeCard, resolveQrBuffer } from "@/lib/id-cards/compose-card";
// pdfkit is a CommonJS module; cast via require to avoid ESM interop issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as typeof import("pdfkit");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── A3 page dimensions (72 pt per inch) ─────────────────────────────────────
const A3_W = 841.89;  // pt
const A3_H = 1190.55; // pt

// ─── Card dimensions in points (6.3 × 8.5 cm) ───────────────────────────────
const CARD_W_PT = (6.3 / 2.54) * 72;   // ≈ 178.58 pt
const CARD_H_PT = (8.5 / 2.54) * 72;   // ≈ 240.94 pt

// ─── 4 × 4 grid — 16 cards per A3 page ──────────────────────────────────────
const COLS = 4;
const ROWS = 4;
const CARDS_PER_PAGE = COLS * ROWS;
// Even gutters around all cards
const H_GAP = (A3_W - COLS * CARD_W_PT) / (COLS + 1);  // ≈ 25.51 pt
const V_GAP = (A3_H - ROWS * CARD_H_PT) / (ROWS + 1);  // ≈ 45.35 pt

const VALID_TYPES = ["GENERAL", "WORKSHOP", "COMBO"] as const;
type RegType = (typeof VALID_TYPES)[number];

async function getAdminContext() {
  const session = await getSession();
  if (!session?.userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: String(session.userId) },
  });
  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email };
}

export async function GET(request: Request) {
  try {
  const admin = await getAdminContext();
  if (!admin) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get("type")?.toUpperCase();
  const registrationType = VALID_TYPES.includes(typeParam as RegType)
    ? (typeParam as RegType)
    : undefined;

  // ── Fetch eligible participants ───────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: {
      shacklesId: { not: null },
      payment: { is: { status: "VERIFIED" } },
      ...(registrationType ? { registrationType } : {}),
    },
    select: {
      shacklesId: true,
      qrPath: true,
      qrImageUrl: true,
    },
    orderBy: { shacklesId: "asc" },
  });

  if (users.length === 0) {
    return new Response("No eligible participants found", { status: 404 });
  }

  // ── Compose all card PNG buffers ──────────────────────────────────────────
  const cardBuffers: Buffer[] = [];
  for (const user of users) {
    const qrBuffer = await resolveQrBuffer(user.qrPath, user.qrImageUrl);
    const card = await composeCard(user.shacklesId!, qrBuffer);
    cardBuffers.push(card);
  }

  // ── Assemble A3 PDF ───────────────────────────────────────────────────────
  const doc = new PDFDocument({
    size: [A3_W, A3_H],
    autoFirstPage: false,
    margin: 0,
    info: {
      Title: "Shackles Symposium – ID Cards",
      Subject: `Registration type: ${registrationType ?? "ALL"}`,
      Creator: "Shackles Admin Portal",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const endPromise = new Promise<void>((resolve) => doc.on("end", resolve));

  for (let pageStart = 0; pageStart < cardBuffers.length; pageStart += CARDS_PER_PAGE) {
    doc.addPage();
    const pageSlice = cardBuffers.slice(pageStart, pageStart + CARDS_PER_PAGE);
    pageSlice.forEach((buf, idx) => {
      const col = idx % COLS;
      const row = Math.floor(idx / COLS);
      const x = H_GAP + col * (CARD_W_PT + H_GAP);
      const y = V_GAP + row * (CARD_H_PT + V_GAP);
      doc.image(buf, x, y, { width: CARD_W_PT, height: CARD_H_PT });
    });
  }

  doc.end();
  await endPromise;

  const pdfBuffer = Buffer.concat(chunks);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `id-cards-${registrationType?.toLowerCase() ?? "all"}-${dateStr}.pdf`;

  await logAdminAudit({
    action: "ID_CARDS_EXPORT",
    actorId: admin.id,
    actorEmail: admin.email,
    target: registrationType ?? "ALL",
    status: "SUCCESS",
    details: { count: users.length, filename },
  });

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "no-store",
    },
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[id-cards/export]", err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
