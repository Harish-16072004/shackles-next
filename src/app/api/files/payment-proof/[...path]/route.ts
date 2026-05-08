import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { promises as fs } from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * GET /api/files/payment-proof/[...path]
 * Serves payment proof images from private storage with authentication.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  // 1. Authentication check
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const segments = params.path;
  if (!segments || segments.length === 0) {
    return NextResponse.json({ error: "File path required" }, { status: 400 });
  }

  // 2. Validate path segments — prevent path traversal
  const hasTraversal = segments.some(
    (seg) => seg === ".." || seg === "." || seg.includes("/") || seg.includes("\\")
  );
  if (hasTraversal) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  // 3. Build the absolute path and verify it's inside the storage directory
  const storageRoot = path.join(process.cwd(), "storage", "uploads", "payment-proofs");
  const filePath = path.join(storageRoot, ...segments);
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(path.resolve(storageRoot))) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  // 4. Read and serve the file
  try {
    const fileBuffer = await fs.readFile(resolved);

    const ext = path.extname(resolved).replace(".", "").toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}
