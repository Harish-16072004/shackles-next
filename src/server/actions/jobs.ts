'use server'

import { getQRQueue, getCSVQueue, QUEUE_NAMES } from "@/lib/queues/registry";
import { getSession } from "@/lib/session";
import { Role } from "@prisma/client";

/**
 * Enqueue a QR generation job for a participant.
 */
export async function enqueueQRGeneration(data: {
  userId: string;
  shacklesId: string;
  qrToken: string;
  registrationType: string;
  year: number;
}) {
  const queue = getQRQueue();
  await queue.add(QUEUE_NAMES.QR_GENERATION, data, {
    jobId: `qr-${data.userId}`, // Prevent duplicate jobs for same user
  });
}

/**
 * Enqueue a CSV export job (Admin only).
 */
export async function enqueueCSVExport(eventId?: string) {
  const session = await getSession();
  if (session?.role !== Role.ADMIN && session?.role !== Role.COORDINATOR) {
    throw new Error("Unauthorized");
  }

  const queue = getCSVQueue();
  const year = parseInt(process.env.ACTIVE_YEAR || new Date().getFullYear().toString());
  
  const job = await queue.add(QUEUE_NAMES.CSV_EXPORT, {
    eventId,
    year,
    adminEmail: session.user?.email || "unknown",
  });

  return { jobId: job.id, message: "CSV export started in background." };
}

/**
 * Check job status (optional helper).
 */
export async function getJobStatus(queueName: string, jobId: string) {
  let queue;
  if (queueName === QUEUE_NAMES.QR_GENERATION) queue = getQRQueue();
  else if (queueName === QUEUE_NAMES.CSV_EXPORT) queue = getCSVQueue();
  else throw new Error("Invalid queue name");

  const job = await queue.getJob(jobId);
  if (!job) return { status: "not_found" };

  const state = await job.getState();
  return {
    id: job.id,
    state,
    progress: job.progress,
    result: job.returnvalue,
    failedReason: job.failedReason,
  };
}
