import { createSpacesSignedGetUrl } from "@/lib/digitalocean/spaces";
import { getStorageProvider, shouldUseDigitalOcean, shouldUseLocal } from "@/lib/storage-provider";

async function createSignedUrl(bucket: string, path: string, expiresIn = 300) {
  try {
    const normalizedPath = path.trim();
    if (!normalizedPath) return null;

    const storageProvider = getStorageProvider();

    if (normalizedPath.startsWith("http://") || normalizedPath.startsWith("https://")) {
      if (shouldUseDigitalOcean(storageProvider)) {
        try {
          const parsed = new URL(normalizedPath);
          let key = decodeURIComponent(parsed.pathname || "").replace(/^\/+/, "");
          if (key.startsWith(`${bucket}/`)) {
            key = key.slice(`${bucket}/`.length);
          }
          if (key) {
            return createSpacesSignedGetUrl(`${bucket}/${key}`.replace(`${bucket}/${bucket}/`, `${bucket}/`), expiresIn);
          }
        } catch {
          return normalizedPath;
        }
      }
      return normalizedPath;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    if (normalizedPath.startsWith("/")) {
      return `${appUrl}${normalizedPath}`;
    }

    if (shouldUseLocal(storageProvider)) {
      return `${appUrl}/uploads/${bucket}/${normalizedPath}`;
    }

    if (shouldUseDigitalOcean(storageProvider)) {
      const key = normalizedPath.startsWith(`${bucket}/`) ? normalizedPath : `${bucket}/${normalizedPath}`;
      return createSpacesSignedGetUrl(key, expiresIn);
    }

    return null;
  } catch {
    return null;
  }
}

export async function getPaymentProofSignedUrl(path?: string | null, expiresIn = 300) {
  if (!path) return null;
  return createSignedUrl("payment-proofs", path, expiresIn);
}

export async function getQrSignedUrl(path?: string | null, expiresIn = 300) {
  if (!path) return null;
  return createSignedUrl("qr-codes", path, expiresIn);
}
