import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_NAMES, QRJobData } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT, // e.g. https://sgp1.digitaloceanspaces.com
  region: "us-east-1",                      // DO Spaces requires this even though it's ignored
  credentials: {
    accessKeyId:     process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
});

const BUCKET = process.env.DO_SPACES_BUCKET!;

async function generateQR(job: Job<QRJobData>) {
  const { participantId, shacklesId, name, eventIds } = job.data;

  // 1. Build encrypted payload — matches your existing QR scanning logic
  const payload = JSON.stringify({
    pid: participantId,
    sid: shacklesId,
    ts:  Date.now(),
  });

  const key = Buffer.from(process.env.QR_ENCRYPTION_KEY!, "hex"); // 32-byte key
  const iv  = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted =
    iv.toString("hex") +
    ":" +
    Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]).toString("hex");

  // 2. Render QR to PNG buffer
  const qrBuffer = await QRCode.toBuffer(encrypted, {
    errorCorrectionLevel: "H",
    width: 400,
    margin: 2,
  });

  // 3. Upload to DigitalOcean Spaces
  const objectKey = `qr-codes/${shacklesId}.png`;
  await s3.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         objectKey,
      Body:        qrBuffer,
      ContentType: "image/png",
      ACL:         "public-read",
    })
  );

  const qrUrl = `${process.env.DO_SPACES_CDN_URL}/${objectKey}`;

  // 4. Persist URL back to the participant record
  await prisma.participant.update({
    where: { id: participantId },
    data:  { qrCodeUrl: qrUrl },
  });

  job.log(`QR generated for ${name} (${shacklesId}) → ${qrUrl}`);
  return { qrUrl };
}

// ─── Worker startup ───────────────────────────────────────────────────────────

export const qrWorker = new Worker<QRJobData>(
  QUEUE_NAMES.QR_GENERATION,
  generateQR,
  {
    connection: redisConnection,
    concurrency: 10, // generate 10 QR codes in parallel
  }
);

qrWorker.on("completed", (job) => {
  console.log(`[QR] ✓ Job ${job.id} completed for ${job.data.shacklesId}`);
});

qrWorker.on("failed", (job, err) => {
  console.error(`[QR] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});
