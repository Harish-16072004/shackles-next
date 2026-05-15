import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_NAMES, CSVExportJobData } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { stringify } from "csv-stringify/sync";
import { sendExportReadyEmail } from "@/lib/email";

const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region:   "us-east-1",
  credentials: {
    accessKeyId:     process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
});

async function exportCSV(job: Job<CSVExportJobData>) {
  const { requestedBy, eventId, filters, notifyEmail } = job.data;

  await job.updateProgress(10);

  // 1. Fetch participants with applied filters
  const participants = await prisma.participant.findMany({
    where: {
      ...(eventId ? { eventRegistrations: { some: { eventId } } } : {}),
      ...(filters?.paymentStatus   ? { paymentStatus: filters.paymentStatus }     : {}),
      ...(filters?.registrationType ? { registrationType: filters.registrationType } : {}),
    },
    include: {
      eventRegistrations: {
        include: { event: { select: { name: true } } },
      },
      team: { select: { name: true } },
    },
    orderBy: { shacklesId: "asc" },
  });

  await job.updateProgress(50);

  // 2. Flatten to CSV rows
  const rows = participants.map((p) => ({
    shackles_id:       p.shacklesId,
    name:              p.name,
    email:             p.email,
    phone:             p.phone,
    college:           p.college,
    payment_status:    p.paymentStatus,
    registration_type: p.registrationType,
    team_name:         p.team?.name ?? "",
    events:            p.eventRegistrations.map((r) => r.event.name).join(" | "),
    registered_at:     p.createdAt.toISOString(),
    kit_collected:     p.kitCollected ? "YES" : "NO",
    qr_url:            p.qrCodeUrl ?? "",
  }));

  const csvContent = stringify(rows, { header: true });
  await job.updateProgress(70);

  // 3. Upload to DO Spaces (private — we'll generate a signed URL)
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const objectKey = `exports/participants-${timestamp}.csv`;

  await s3.send(
    new PutObjectCommand({
      Bucket:      process.env.DO_SPACES_BUCKET!,
      Key:         objectKey,
      Body:        Buffer.from(csvContent, "utf-8"),
      ContentType: "text/csv",
      ACL:         "private",
      Metadata: {
        "requested-by": requestedBy,
        "row-count":    String(rows.length),
      },
    })
  );

  await job.updateProgress(90);

  // 4. Notify the coordinator that the file is ready
  const downloadUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/exports/download?key=${encodeURIComponent(objectKey)}`;
  await sendExportReadyEmail({
    to:          notifyEmail,
    downloadUrl,
    rowCount:    rows.length,
    generatedAt: new Date(),
  });

  await job.updateProgress(100);
  job.log(`Exported ${rows.length} rows → ${objectKey}`);

  return { objectKey, rowCount: rows.length };
}

export const csvWorker = new Worker<CSVExportJobData>(
  QUEUE_NAMES.CSV_EXPORT,
  exportCSV,
  {
    connection:  redisConnection,
    concurrency: 2, // CSV exports are DB-heavy; keep concurrency low
  }
);

csvWorker.on("completed", (job) => {
  console.log(`[CSV] ✓ Job ${job.id} — ${job.returnvalue?.rowCount} rows exported`);
});

csvWorker.on("failed", (job, err) => {
  console.error(`[CSV] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

csvWorker.on("progress", (job, progress) => {
  console.log(`[CSV] Job ${job.id} progress: ${progress}%`);
});
