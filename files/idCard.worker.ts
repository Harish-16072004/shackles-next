import { Worker, Job } from "bullmq";
import { redisConnection } from "@/lib/redis";
import { QUEUE_NAMES, IDCardJobData } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import puppeteer from "puppeteer";
import { renderIDCardHTML } from "@/lib/templates/idCard";

const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region:   "us-east-1",
  credentials: {
    accessKeyId:     process.env.DO_SPACES_KEY!,
    secretAccessKey: process.env.DO_SPACES_SECRET!,
  },
});

async function generateIDCards(job: Job<IDCardJobData>) {
  const { participantIds, format } = job.data;
  const total = participantIds.length;
  const results: { participantId: string; url: string }[] = [];

  // Launch one browser instance and reuse it across all cards in this job
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (let i = 0; i < participantIds.length; i++) {
      const participantId = participantIds[i];

      const participant = await prisma.participant.findUniqueOrThrow({
        where: { id: participantId },
        include: {
          team:               { select: { name: true } },
          eventRegistrations: { include: { event: { select: { name: true } } } },
        },
      });

      // Render HTML template → PDF or PNG via Puppeteer
      const html = renderIDCardHTML(participant);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      let fileBuffer: Buffer;
      let contentType: string;
      let ext: string;

      if (format === "PDF") {
        const pdf = await page.pdf({
          width:  "85.6mm", // CR80 card size
          height: "54mm",
          printBackground: true,
        });
        fileBuffer  = Buffer.from(pdf);
        contentType = "application/pdf";
        ext         = "pdf";
      } else {
        await page.setViewport({ width: 323, height: 204, deviceScaleFactor: 2 });
        const screenshot = await page.screenshot({ type: "png", fullPage: false });
        fileBuffer  = Buffer.from(screenshot);
        contentType = "image/png";
        ext         = "png";
      }

      await page.close();

      // Upload to DO Spaces
      const objectKey = `id-cards/${participant.shacklesId}.${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket:      process.env.DO_SPACES_BUCKET!,
          Key:         objectKey,
          Body:        fileBuffer,
          ContentType: contentType,
          ACL:         "public-read",
        })
      );

      const url = `${process.env.DO_SPACES_CDN_URL}/${objectKey}`;

      // Persist the ID card URL back to the participant
      await prisma.participant.update({
        where: { id: participantId },
        data:  { idCardUrl: url },
      });

      results.push({ participantId, url });

      // Report granular progress so the admin UI can show a real progress bar
      await job.updateProgress(Math.round(((i + 1) / total) * 100));
      job.log(`Card generated for ${participant.shacklesId}`);
    }
  } finally {
    await browser.close();
  }

  return { generated: results.length, urls: results };
}

export const idCardWorker = new Worker<IDCardJobData>(
  QUEUE_NAMES.ID_CARD,
  generateIDCards,
  {
    connection:  redisConnection,
    concurrency: 1, // Puppeteer is memory-hungry; one bulk job at a time
  }
);

idCardWorker.on("completed", (job) => {
  console.log(`[ID Card] ✓ Job ${job.id} — ${job.returnvalue?.generated} cards generated`);
});

idCardWorker.on("failed", (job, err) => {
  console.error(`[ID Card] ✗ Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
});

idCardWorker.on("progress", (job, progress) => {
  console.log(`[ID Card] Job ${job.id} progress: ${progress}%`);
});
