import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_NAMES, QRJobData } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { getStorageProvider, shouldUseDigitalOcean, shouldUseLocal } from "@/lib/storage-provider";
import { uploadToSpaces } from "@/lib/digitalocean/spaces";
import { encodeQrPayload } from "@/server/services/qr.service";
import { promises as fs } from "fs";
import path from "path";

async function processQRGeneration(job: Job<QRJobData>) {
  const { userId, shacklesId, qrToken, registrationType, year } = job.data;

  try {
    // 1. Generate QR Value
    const qrValue = encodeQrPayload({
      v: 1,
      type: 'USER',
      uid: qrToken,
      sid: shacklesId,
      y: year,
    });

    // 2. Generate Buffer
    const qrBuffer = await QRCode.toBuffer(qrValue, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
    });

    // 3. Storage
    const month = String(new Date().getUTCMonth() + 1).padStart(2, "0");
    const typeSegment = registrationType.toLowerCase();
    const spacesKey = `qr-codes/${year}/${month}/${typeSegment}/${shacklesId}.png`;

    const storageProvider = getStorageProvider();
    let qrPath: string;

    if (shouldUseLocal(storageProvider)) {
      const storageDir = path.join(process.cwd(), "storage", "qr-codes");
      const fileDir = path.join(storageDir, year.toString(), month, typeSegment);
      const filePath = path.join(fileDir, `${shacklesId}.png`);
      
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, qrBuffer);
      qrPath = `qr-codes/${year}/${month}/${typeSegment}/${shacklesId}.png`;
    } else {
      await uploadToSpaces({
        key: spacesKey,
        body: qrBuffer,
        contentType: "image/png",
        upsert: true,
      });
      qrPath = spacesKey;
    }

    // 4. Update Database
    await prisma.user.update({
      where: { id: userId },
      data: {
        qrPath,
        updatedAt: new Date(),
      },
    });

    // 5. Send Payment Verified Email (with QR code embedded inline)
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          shacklesId: true,
          payment: { select: { packageType: true } },
        },
      });

      if (user?.email && user.shacklesId) {
        const { sendPaymentVerificationEmail } = await import("@/server/services/email.service");
        await sendPaymentVerificationEmail({
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`.trim(),
          shacklesId: user.shacklesId,
          packageType: user.payment?.packageType || "EVENT_ONLY",
          eventYear: year,
          qrImageBuffer: qrBuffer,
        });
        console.log(`[QRWorker] Payment verification email (with QR) sent to ${user.email}`);
      }
    } catch (emailError) {
      // Non-fatal: QR was generated successfully, just log the email failure
      console.error(`[QRWorker] Failed to send verification email for ${userId}:`, emailError);
    }

    return { success: true, qrPath };
  } catch (error) {
    console.error(`[QRWorker] Failed to process job ${job.id}:`, error);
    throw error;
  }
}

export const qrWorker = new Worker(
  QUEUE_NAMES.QR_GENERATION,
  processQRGeneration,
  {
    connection: redisConnection,
    concurrency: 5,
  }
);

qrWorker.on("completed", (job) => {
  console.log(`[QRWorker] Job ${job.id} completed successfully`);
});

qrWorker.on("failed", (job, err) => {
  console.error(`[QRWorker] Job ${job?.id} failed:`, err);
});
