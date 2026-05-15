import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_NAMES, CSVExportJobData } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";
import { uploadToSpaces } from "@/lib/digitalocean/spaces";
import { stringify } from "csv-stringify/sync";
import { getStorageProvider, shouldUseDigitalOcean, shouldUseLocal } from "@/lib/storage-provider";
import { promises as fs } from "fs";
import path from "path";

async function exportCSV(job: Job<CSVExportJobData>) {
  const { eventId, year, adminEmail } = job.data;

  await job.updateProgress(10);

  // 1. Fetch participants
  const participants = await prisma.user.findMany({
    where: {
      role: 'PARTICIPANT',
      ...(eventId ? { registrations: { some: { eventId } } } : {}),
      payment: {
        status: 'VERIFIED',
        year: year,
      },
    },
    include: {
      registrations: {
        include: { event: { select: { name: true } } },
      },
      payment: true,
    },
    orderBy: { shacklesId: "asc" },
  });

  await job.updateProgress(50);

  // 2. Flatten to CSV rows
  const rows = participants.map((p) => ({
    shackles_id:       p.shacklesId,
    first_name:        p.firstName,
    last_name:         p.lastName,
    email:             p.email,
    phone:             p.phone,
    college:           p.collegeName,
    department:        p.department,
    payment_status:    p.payment?.status ?? "N/A",
    registration_type: p.registrationType,
    events:            p.registrations.map((r) => r.event.name).join(" | "),
    kit_status:        p.kitStatus,
    created_at:        p.createdAt.toISOString(),
  }));

  const csvContent = stringify(rows, { header: true });
  await job.updateProgress(70);

  // 3. Storage
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `participants-${year}${eventId ? `-${eventId}` : ''}-${timestamp}.csv`;
  const storageKey = `exports/${fileName}`;

  const storageProvider = getStorageProvider();
  let downloadUrl: string;

  if (shouldUseLocal(storageProvider)) {
    const storageDir = path.join(process.cwd(), "storage", "exports");
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(path.join(storageDir, fileName), csvContent);
    downloadUrl = `/api/admin/csv/download?file=${fileName}`; // Simplified for example
  } else {
    await uploadToSpaces({
      key: storageKey,
      body: Buffer.from(csvContent, "utf-8"),
      contentType: "text/csv",
      upsert: true,
    });
    // This would ideally be a signed URL or CDN URL
    downloadUrl = `${process.env.DO_SPACES_CDN_URL}/${storageKey}`;
  }

  await job.updateProgress(90);

  // 4. In a real app, you'd send an email here
  console.log(`[CSVWorker] Export ready for ${adminEmail}: ${downloadUrl}`);

  await job.updateProgress(100);
  return { downloadUrl, rowCount: rows.length };
}

export const csvWorker = new Worker(
  QUEUE_NAMES.CSV_EXPORT,
  exportCSV,
  {
    connection: redisConnection,
    concurrency: 1,
  }
);
