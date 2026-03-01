import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getStorageProvider, shouldUseDigitalOcean, shouldUseLocal } from "@/lib/storage-provider";
import { createSpacesSignedGetUrl, uploadToSpaces } from "@/lib/digitalocean/spaces";
import { promises as fs } from "fs";
import path from "path";
import { safeLogError } from "@/lib/safe-log";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "payment-proof upload API is running. Use POST multipart/form-data with field name 'file'.",
  });
}

function inferExtension(file: File) {
  const type = file.type?.toLowerCase() || "";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("gif")) return "gif";

  const name = file.name?.toLowerCase() || "";
  const ext = name.split(".").pop();
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }

  return "jpg";
}

function toReadableError(message: string) {
  if (message === "fetch failed") {
    return "Unable to connect to remote storage from this server/network. Check internet/firewall/proxy and verify the configured storage endpoint is reachable on port 443.";
  }
  return message;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!file.type?.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 4MB)" }, { status: 400 });
    }

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const extension = inferExtension(file);
    const proofFilename = `${randomUUID()}.${extension}`;
    const spacesKey = `payment-proofs/${year}/${month}/${proofFilename}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const storageProvider = getStorageProvider();

    if (shouldUseLocal(storageProvider)) {
      // Local filesystem storage
      const publicDir = path.join(process.cwd(), "public", "uploads", "payment-proofs");
      const fileDir = path.join(publicDir, year.toString(), month);
      const filePath = path.join(fileDir, proofFilename);
      
      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });
      
      // Write file
      await fs.writeFile(filePath, bytes);
      
      // Return path relative to public directory for serving
      const publicPath = `/uploads/payment-proofs/${year}/${month}/${path.basename(filePath)}`;
      const fullUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}${publicPath}`;
      
      return NextResponse.json({
        proofPath: publicPath,
        proofUrl: fullUrl,
      });
    } else if (shouldUseDigitalOcean(storageProvider)) {
      await uploadToSpaces({
        key: spacesKey,
        body: bytes,
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

      const signedUrl = await createSpacesSignedGetUrl(spacesKey, 3600);

      return NextResponse.json({
        proofPath: spacesKey,
        proofUrl: signedUrl,
      });
    } else {
      return NextResponse.json({ error: "Unsupported storage provider configuration." }, { status: 500 });
    }
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Failed to upload payment proof";
    const message = toReadableError(raw);
    safeLogError("[payment-proof upload] Unhandled error", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
