"use server";

import { requireRole } from "@/lib/auth";
import { getQRQueue, getCSVQueue, getIDCardQueue } from "@/lib/queues/registry";
import { prisma } from "@/lib/prisma";

// ─── Enqueue QR generation after registration ─────────────────────────────────

export async function enqueueQRGeneration(participantId: string) {
  const participant = await prisma.participant.findUniqueOrThrow({
    where:   { id: participantId },
    include: { eventRegistrations: { select: { eventId: true } } },
  });

  const job = await getQRQueue().add(
    "generate-qr",
    {
      participantId,
      shacklesId: participant.shacklesId,
      name:       participant.name,
      eventIds:   participant.eventRegistrations.map((r) => r.eventId),
    },
    {
      // Deduplicate: if a QR job for this participant is already queued,
      // don't add another one. Useful during on-spot registration spikes.
      jobId: `qr:${participantId}`,
    }
  );

  return { jobId: job.id };
}

// ─── Enqueue CSV export (admin/coordinator only) ──────────────────────────────

export async function enqueueCSVExport(input: {
  eventId?: string;
  filters?: { paymentStatus?: "PAID" | "PENDING" | "FAILED"; registrationType?: "SOLO" | "TEAM" };
}) {
  const session = await requireRole(["ADMIN", "COORDINATOR"]);

  const job = await getCSVQueue().add("export-csv", {
    requestedBy:  session.userId,
    notifyEmail:  session.email,
    eventId:      input.eventId,
    filters:      input.filters,
  });

  return { jobId: job.id, message: "Export started. You will receive an email when it's ready." };
}

// ─── Enqueue bulk ID card generation (admin only) ─────────────────────────────

export async function enqueueIDCardGeneration(input: {
  participantIds?: string[];  // specific participants, or omit for all
  format?: "PDF" | "PNG";
}) {
  const session = await requireRole(["ADMIN"]);

  const participantIds =
    input.participantIds ??
    (await prisma.participant.findMany({ select: { id: true } })).map((p) => p.id);

  // Split into chunks of 50 so each job stays manageable and retries are cheap
  const CHUNK_SIZE = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < participantIds.length; i += CHUNK_SIZE) {
    chunks.push(participantIds.slice(i, i + CHUNK_SIZE));
  }

  const jobs = await Promise.all(
    chunks.map((chunk, index) =>
      getIDCardQueue().add("generate-id-cards", {
        participantIds: chunk,
        requestedBy:    session.userId,
        format:         input.format ?? "PDF",
      }, {
        // Lower priority for later chunks — process early chunks first
        priority: index + 1,
      })
    )
  );

  return {
    jobIds:  jobs.map((j) => j.id),
    chunks:  chunks.length,
    total:   participantIds.length,
    message: `${participantIds.length} ID cards queued across ${chunks.length} batch(es).`,
  };
}

// ─── Poll job status (used by the admin UI progress bar) ─────────────────────

export async function getJobStatus(queue: "qr" | "csv" | "id-card", jobId: string) {
  const q = queue === "qr" ? getQRQueue() : queue === "csv" ? getCSVQueue() : getIDCardQueue();
  const job = await q.getJob(jobId);

  if (!job) return { status: "not-found" };

  const state    = await job.getState();
  const progress = job.progress;
  const logs     = await job.logs(0, 20);

  return {
    status:       state,
    progress,
    attemptsMade: job.attemptsMade,
    failReason:   job.failedReason ?? null,
    logs:         logs.logs,
    returnValue:  job.returnvalue ?? null,
  };
}
