import imageCompression from 'browser-image-compression';

/**
 * Compresses an image file client-side before upload.
 * Target: ~200KB max, 1920px max dimension, WebP output where supported.
 * Falls back to the original file if compression fails.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    // Skip compression for very small files (< 250KB)
    if (file.size <= 250 * 1024) {
      return file;
    }

    const compressed = await imageCompression(file, {
      maxSizeMB: 0.2, // ~200KB
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality: 0.8,
    });

    // Only use compressed version if it's actually smaller
    if (compressed.size < file.size) {
      return compressed;
    }

    return file;
  } catch {
    // Graceful fallback: return the original file if compression fails
    console.warn('[compressImage] Compression failed, using original file.');
    return file;
  }
}
