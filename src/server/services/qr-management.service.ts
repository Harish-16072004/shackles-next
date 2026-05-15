/**
 * QR Token Management Service
 * - Generate QR tokens when payment is verified
 * - Handle QR scans at various stations
 * - Track scan history
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { generateQRToken } from "@/server/services/registration-helpers.service";
import { getActiveYear } from "@/lib/edition";
import { QrPayloadError, decodeQrPayload } from "@/server/services/qr.service";

type DbClient = Prisma.TransactionClient | PrismaClient;

export interface QRScanPayload {
  qrData: string; // encoded QR payload string — always required
  stationId: string;
  eventId?: string;
  operationType: "ATTENDANCE" | "KIT" | "OTHER";
  timestamp?: Date;
}

export interface QRScanResult {
  success: boolean;
  userId?: string;
  shacklesId?: string;
  userName?: string;
  message?: string;
  error?: string;
  registeredEvents?: Array<{ id: string; name: string; type: string | null; attended: boolean }>;
  availableEvents?: Array<{ id: string; name: string; type: string | null; participationMode?: string; maxTeamSize?: number | null }>;
}

/**
 * Generate and store QR token for a user when payment is verified.
 * Called when admin marks payment as VERIFIED for a year.
 */
export async function generateQRTokenForUser(
  db: DbClient,
  userId: string,
  year: number
): Promise<{ token: string; error?: string }> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return { token: "", error: "User not found" };
    }

    const token = generateQRToken();

    await db.user.update({
      where: { id: userId },
      data: {
        qrToken: token,
        qrTokenExpiry: new Date(year + 1, 0, 1),
      },
    });

    return { token };
  } catch (err) {
    console.error("Error generating QR token:", err);
    return { token: "", error: String(err) };
  }
}

/**
 * Process a QR scan.
 * Decodes the structured QR payload, validates the user's payment,
 * then performs the requested operation (ATTENDANCE or KIT).
 * Records every scan attempt in RegistrationOperation.
 */
export async function processQRScan(
  db: DbClient,
  payload: QRScanPayload
): Promise<QRScanResult> {
  const activeYear = getActiveYear();

  try {
    const scanValue = payload.qrData.trim();
    if (!scanValue) {
      return { success: false, error: "QR data is empty." };
    }

    // --- Decode structured payload ---
    let userQrToken: string;
    try {
      const structured = decodeQrPayload(scanValue);

      if (structured.type !== "USER") {
        return {
          success: false,
          error: "Invalid QR type — expected a personal USER QR code.",
        };
      }

      // uid in the USER payload is the qrToken stored on the user row
      userQrToken = structured.uid;

      // Reject stale QR codes from a previous year
      if (structured.y !== activeYear) {
        return {
          success: false,
          error: `QR code is from ${structured.y}, not the current year (${activeYear}). Please generate a new QR.`,
        };
      }
    } catch (error) {
      if (error instanceof QrPayloadError) {
        return { success: false, error: error.message };
      }
      throw error;
    }

    // --- Look up user strictly by qrToken ---
    const user = await db.user.findUnique({
      where: { qrToken: userQrToken },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        shacklesId: true,
        email: true,
        phone: true,
        payment: {
          select: { status: true, year: true },
        },
      },
    });

    if (!user) {
      return { success: false, error: "QR token not found or invalid." };
    }

    return processStructuredScan(db, payload, user, activeYear);
  } catch (err) {
    console.error("Error processing QR scan:", err);
    return {
      success: false,
      error: `Scan processing failed: ${String(err)}`,
    };
  }
}

async function processStructuredScan(
  db: DbClient,
  payload: QRScanPayload,
  user: {
    id: string;
    firstName: string;
    lastName: string;
    shacklesId: string | null;
    email: string;
    phone: string;
    payment: { status: string; year: number | null } | null;
  },
  activeYear: number
): Promise<QRScanResult> {
  if (user.payment?.status !== "VERIFIED" || user.payment?.year !== activeYear) {
    return {
      success: false,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      error: "Payment not verified for current year.",
    };
  }

  const userName = `${user.firstName} ${user.lastName}`;

  if (payload.operationType === "ATTENDANCE") {
    if (payload.eventId) {
      const eventRegistration = await db.eventRegistration.findUnique({
        where: {
          userId_eventId: {
            userId: user.id,
            eventId: payload.eventId,
          },
        },
        select: {
          id: true,
          attended: true,
          teamId: true,
          team: { select: { status: true } },
          event: { select: { name: true } },
        },
      });

      if (!eventRegistration) {
        return {
          success: false,
          userId: user.id,
          shacklesId: user.shacklesId || undefined,
          userName,
          error: "NOT REGISTERED FOR THE REQUESTED EVENT.",
        };
      }

      // Enforce team-lock before marking attendance
      if (
        eventRegistration.teamId &&
        eventRegistration.team?.status !== "LOCKED"
      ) {
        return {
          success: false,
          userId: user.id,
          shacklesId: user.shacklesId || undefined,
          userName,
          error: "TEAM REGISTRATION MUST BE LOCKED BEFORE MARKING ATTENDANCE.",
        };
      }

      if (eventRegistration.attended) {
        await logScanOperation(db, payload, user.id);
        return {
          success: true,
          userId: user.id,
          shacklesId: user.shacklesId || undefined,
          userName,
          message: `${userName.toUpperCase()} ALREADY CHECKED IN FOR ${eventRegistration.event.name.toUpperCase()}.`,
        };
      }

      // ATOMIC TRANSACTION: Mark attendance + Log operation
      const performAttendanceUpdate = async (tx: Prisma.TransactionClient) => {
        await tx.eventRegistration.update({
          where: { id: eventRegistration.id },
          data: {
            attended: true,
            attendedAt: new Date(),
            stationId: payload.stationId,
          },
        });

        await logScanOperation(tx, payload, user.id);

        return {
          success: true,
          userId: user.id,
          shacklesId: user.shacklesId || undefined,
          userName,
          message: `ATTENDANCE MARKED FOR ${eventRegistration.event.name.toUpperCase()}.`,
        };
      };

      if ('$transaction' in db) {
        return await (db as any).$transaction(performAttendanceUpdate);
      }
      return await performAttendanceUpdate(db as Prisma.TransactionClient);
    } else {
      // General symposium attendance (no eventId)
      const allEvents = await db.event.findMany({
        where: { year: activeYear, isActive: true },
        select: { id: true, name: true, type: true, participationMode: true, teamMaxSize: true }
      });
      
      const userRegistrations = await db.eventRegistration.findMany({
        where: { userId: user.id },
        select: { eventId: true, attended: true }
      });
      
      const registeredEventIds = new Set(userRegistrations.map(r => r.eventId));
      
      const registeredEventsList = allEvents.filter(e => registeredEventIds.has(e.id)).map(e => ({
        ...e,
        attended: userRegistrations.find(r => r.eventId === e.id)?.attended || false
      }));
      const availableEventsList = allEvents.filter(e => !registeredEventIds.has(e.id)).map(e => ({
        id: e.id,
        name: e.name,
        type: e.type,
        participationMode: e.participationMode,
        maxTeamSize: e.teamMaxSize,
      }));

      await logScanOperation(db, payload, user.id);
      return {
        success: true,
        userId: user.id,
        shacklesId: user.shacklesId || undefined,
        userName,
        message: `SYMPOSIUM ENTRY RECORDED FOR ${userName.toUpperCase()}.`,
        registeredEvents: registeredEventsList,
        availableEvents: availableEventsList,
      };
    }
  } else if (payload.operationType === "KIT") {
    // ATOMIC TRANSACTION: Update kit status + Log operation
    const performKitIssue = async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          kitStatus: "ISSUED",
          kitIssuedAt: new Date(),
          kitIssuedBy: payload.stationId,
        },
      });

      await logScanOperation(tx, payload, user.id);

      return {
        success: true,
        userId: user.id,
        shacklesId: user.shacklesId || undefined,
        userName,
        message: `KIT ISSUED TO ${userName.toUpperCase()}.`,
      };
    };

    if ('$transaction' in db) {
      return await (db as any).$transaction(performKitIssue);
    }
    return await performKitIssue(db as Prisma.TransactionClient);
  }

  return {
    success: false,
    error: "INVALID OPERATION TYPE.",
  };
}

/** Persist a scan record to RegistrationOperation. */
async function logScanOperation(
  db: DbClient,
  payload: QRScanPayload,
  participantId: string
): Promise<void> {
  await db.registrationOperation.create({
    data: {
      operationId: `SCAN_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      stationId: payload.stationId,
      operationType: payload.operationType === "ATTENDANCE" ? "ATTENDANCE" : "KIT",
      participantId,
      status: "APPLIED",
      processedAt: payload.timestamp ?? new Date(),
    },
  });
}

/**
 * Get QR scan history for a user.
 */
export async function getQRScanHistory(
  db: DbClient,
  userId: string,
  limit = 50
) {
  try {
    const scans = await db.registrationOperation.findMany({
      where: {
        participantId: userId,
        operationType: { in: ["ATTENDANCE", "KIT"] },
      },
      orderBy: { processedAt: "desc" },
      take: limit,
      select: {
        id: true,
        operationType: true,
        stationId: true,
        processedAt: true,
        status: true,
      },
    });

    return { success: true, scans };
  } catch (err) {
    console.error("Error fetching QR scan history:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Validate QR token format and existence.
 */
export async function validateQRToken(
  db: DbClient,
  qrToken: string
): Promise<{ valid: boolean; userId?: string; message?: string }> {
  try {
    const user = await db.user.findUnique({
      where: { qrToken },
      select: {
        id: true,
        payment: { select: { status: true, year: true } },
      },
    });

    if (!user) {
      return { valid: false, message: "QR token not found." };
    }

    const activeYear = getActiveYear();
    if (user.payment?.status !== "VERIFIED" || user.payment?.year !== activeYear) {
      return { valid: false, message: "Payment not current." };
    }

    return { valid: true, userId: user.id };
  } catch (err) {
    console.error("Error validating QR token:", err);
    return { valid: false, message: String(err) };
  }
}
