'use server'

import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getStorageProvider, shouldUseDigitalOcean, shouldUseLocal } from "@/lib/storage-provider";
import { uploadToSpaces } from "@/lib/digitalocean/spaces";
import { getActiveYear } from "@/lib/edition";
import { promises as fs } from "fs";
import path from "path";
import { allocateShacklesId } from "@/server/services/shackles-id.service";
import { runSerializableTransaction } from "@/server/services/transaction.service";

type QrUploadResult = {
  qrImageUrl: string | null;
  qrPath?: string;
};

async function generateQrImageBuffer(qrToken: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrToken)}`;
  let response: Response;
  try {
    response = await fetch(qrApiUrl, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error("Failed to generate QR image");
  }

  return response.arrayBuffer();
}

async function uploadQrToStorage(
  qrImageBuffer: ArrayBuffer,
  shacklesId: string,
  registrationType: string,
  year: number
) {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const typeSegment = registrationType.toLowerCase();
  const spacesKey = `qr-codes/${year}/${month}/${typeSegment}/${shacklesId}.png`;

  const storageProvider = getStorageProvider();

  if (shouldUseLocal(storageProvider)) {
    // Local filesystem storage
    const publicDir = path.join(process.cwd(), "public", "uploads", "qr-codes");
    const fileDir = path.join(publicDir, year.toString(), month, typeSegment);
    const filePath = path.join(fileDir, `${shacklesId}.png`);
    
    // Ensure directory exists
    await fs.mkdir(fileDir, { recursive: true });
    
    // Write file
    await fs.writeFile(filePath, Buffer.from(qrImageBuffer));
    
    // Return path relative to public directory
    const publicPath = `/uploads/qr-codes/${year}/${month}/${typeSegment}/${shacklesId}.png`;
    
    return { qrPath: publicPath };
  } else if (shouldUseDigitalOcean(storageProvider)) {
    await uploadToSpaces({
      key: spacesKey,
      body: Buffer.from(qrImageBuffer),
      contentType: "image/png",
      upsert: true,
    });

    return { qrPath: spacesKey };
  } else {
    throw new Error("Unsupported storage provider configuration.");
  }
}

async function uploadQrImage(qrToken: string, shacklesId: string, registrationType: string): Promise<QrUploadResult> {
  const qrImageBuffer = await generateQrImageBuffer(qrToken);
  const uploadResult = await uploadQrToStorage(qrImageBuffer, shacklesId, registrationType, getActiveYear());

  return {
    qrImageUrl: null,
    qrPath: uploadResult.qrPath,
  };
}

export async function verifyUserPayment(userId: string, action: 'APPROVE' | 'REJECT') {
  try {
    if (action === 'REJECT') {
      await prisma.payment.update({
        where: { userId },
        data: { 
          status: 'REJECTED',
          rejectedAt: new Date()
        }
      });
    } else {
      // 1. Fetch the user to check their Registration Type
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          registrationType: true,
          onSpotProfile: {
            select: { id: true },
          },
          payment: {
            select: { captureSource: true },
          },
        },
      });
      if (!user) return { success: false, error: "User not found" };

      const isOnSpotParticipant =
        user.payment?.captureSource === 'ON_SPOT' || Boolean(user.onSpotProfile);
      const sequenceStart = isOnSpotParticipant ? 500 : 1;

      const activeYear = getActiveYear();

      const maxRetries = 5;
      let approved = false;

      for (let attempt = 0; attempt < maxRetries && !approved; attempt += 1) { 
        const qrToken = crypto.randomBytes(32).toString('hex');
        const qrTokenExpiry = new Date();
        qrTokenExpiry.setDate(qrTokenExpiry.getDate() + 30);

        try {
          const qrUploadContext = await runSerializableTransaction(prisma, async (tx) => {
            const shacklesId = await allocateShacklesId({
              tx,
              year: activeYear,
              registrationType: user.registrationType,
              startFrom: sequenceStart,
            });

            await tx.payment.update({
              where: { userId },
              data: {
                status: 'VERIFIED',
                verifiedAt: new Date(),
              },
            });

            await tx.user.update({
              where: { id: userId },
              data: {
                role: 'PARTICIPANT',
                shacklesId,
                qrToken,
                qrImageUrl: null,
                qrPath: null,
                qrTokenExpiry,
              },
            });

            return {
              shacklesId,
              qrToken,
              registrationType: user.registrationType,
            };
          });

          approved = true;

          if (qrUploadContext) {
            try {
              const qrUpload = await uploadQrImage(
                qrUploadContext.qrToken,
                qrUploadContext.shacklesId,
                qrUploadContext.registrationType
              );

              await prisma.user.update({
                where: { id: userId },
                data: {
                  qrImageUrl: qrUpload.qrImageUrl,
                  qrPath: qrUpload.qrPath,
                },
              });
            } catch (uploadError) {
              console.warn('QR upload failed after verification. Continuing with token-only QR access.', uploadError);
            }
          }
        } catch (error) {
          const prismaError = error as Prisma.PrismaClientKnownRequestError;
          const isUniqueConflict = prismaError?.code === 'P2002';

          if (!isUniqueConflict || attempt === maxRetries - 1) {
            throw error;
          }
        }
      }

      if (!approved) {
        throw new Error('Could not allocate a unique Shackles ID for this year.');
      }
    }

    revalidatePath('/admin');
    revalidatePath('/admin/adminDashboard');
    revalidatePath('/userDashboard');
    return { success: true };

  } catch (error) {
    console.error("Admin Action Failed:", error);
    return { success: false, error: "Failed to update status" };
  }
}