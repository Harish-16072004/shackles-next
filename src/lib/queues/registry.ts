import { Queue, QueueOptions } from "bullmq";
import { redisConnection } from "@/lib/redis";

// --- Types ---

export interface QRJobData {
  userId: string;
  shacklesId: string;
  qrToken: string;
  registrationType: string;
  year: number;
}

export interface CSVExportJobData {
  eventId?: string;
  year: number;
  adminEmail: string;
}

export interface IDCardJobData {
  participantIds: string[];
  format: "PDF" | "ZIP";
  adminEmail: string;
}

// --- Constants ---

export const QUEUE_NAMES = {
  QR_GENERATION: "qr-generation",
  CSV_EXPORT: "csv-export",
  ID_CARD_GENERATION: "id-card-generation",
} as const;

const defaultOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
};

// --- Queue Instances (Lazy Init) ---

let qrQueue: Queue | null = null;
let csvQueue: Queue | null = null;
let idCardQueue: Queue | null = null;

export function getQRQueue() {
  if (!qrQueue) qrQueue = new Queue(QUEUE_NAMES.QR_GENERATION, defaultOptions);
  return qrQueue;
}

export function getCSVQueue() {
  if (!csvQueue) csvQueue = new Queue(QUEUE_NAMES.CSV_EXPORT, defaultOptions);
  return csvQueue;
}

export function getIDCardQueue() {
  if (!idCardQueue) idCardQueue = new Queue(QUEUE_NAMES.ID_CARD_GENERATION, defaultOptions);
  return idCardQueue;
}
