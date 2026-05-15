import { Queue, Worker, QueueEvents } from "bullmq";
import { redisConnection } from "@/lib/redis";

// ─── Job payload types ────────────────────────────────────────────────────────

export interface QRJobData {
  participantId: string;
  shacklesId: string;
  name: string;
  eventIds: string[];
}

export interface CSVExportJobData {
  requestedBy: string; // userId who triggered the export
  eventId?: string;    // scoped export, or omit for all participants
  filters?: {
    paymentStatus?: "PAID" | "PENDING" | "FAILED";
    registrationType?: "SOLO" | "TEAM";
  };
  notifyEmail: string; // where to send the download link when ready
}

export interface IDCardJobData {
  participantIds: string[];   // bulk — pass all at once
  requestedBy: string;
  format: "PDF" | "PNG";
}

export type JobData = QRJobData | CSVExportJobData | IDCardJobData;

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  QR_GENERATION:  "qr-generation",
  CSV_EXPORT:     "csv-export",
  ID_CARD:        "id-card",
} as const;

// ─── Shared default job options ───────────────────────────────────────────────

const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 2_000, // 2s → 4s → 8s
  },
  removeOnComplete: { count: 100 },  // keep last 100 completed jobs for audit
  removeOnFail:     { count: 500 },  // keep failed jobs longer for debugging
};

// ─── Singleton queue instances ────────────────────────────────────────────────
// One Queue instance per process is enough — BullMQ handles concurrency internally.

let _qrQueue:  Queue<QRJobData>      | null = null;
let _csvQueue: Queue<CSVExportJobData>| null = null;
let _idQueue:  Queue<IDCardJobData>  | null = null;

export function getQRQueue() {
  if (!_qrQueue) {
    _qrQueue = new Queue<QRJobData>(QUEUE_NAMES.QR_GENERATION, {
      connection: redisConnection,
      defaultJobOptions,
    });
  }
  return _qrQueue;
}

export function getCSVQueue() {
  if (!_csvQueue) {
    _csvQueue = new Queue<CSVExportJobData>(QUEUE_NAMES.CSV_EXPORT, {
      connection: redisConnection,
      defaultJobOptions,
    });
  }
  return _csvQueue;
}

export function getIDCardQueue() {
  if (!_idQueue) {
    _idQueue = new Queue<IDCardJobData>(QUEUE_NAMES.ID_CARD, {
      connection: redisConnection,
      defaultJobOptions,
    });
  }
  return _idQueue;
}
