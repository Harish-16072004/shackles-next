/**
 * API Route: POST /api/scanner/qr-scan
 * Handles QR code scans from stations
 */

import { NextRequest, NextResponse } from "next/server";
import { Permission } from "@prisma/client";
import { processQRScan, QRScanPayload } from "@/server/services/qr-management.service";
import { prisma as db } from "@/lib/prisma";
import { requireEventPermission, authorizeScannerActor } from "@/server/services/scanner-auth.service";

export const maxDuration = 30;

interface QRScanRequest {
  qrToken?: string;
  qrData?: string;
  stationId: string;
  eventId?: string;
  operationType: "ATTENDANCE" | "KIT" | "OTHER";
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as QRScanRequest;

    // Validate required fields
    const scanValue = body.qrData || body.qrToken || "";

    if (!scanValue) {
      return NextResponse.json(
        { success: false, error: "Missing qrData or qrToken" },
        { status: 400 }
      );
    }

    if (!body.stationId) {
      return NextResponse.json(
        { success: false, error: "Missing stationId" },
        { status: 400 }
      );
    }

    if (!body.operationType) {
      return NextResponse.json(
        { success: false, error: "Missing operationType" },
        { status: 400 }
      );
    }

    if ((body.operationType === "ATTENDANCE" || body.operationType === "KIT") && !body.eventId) {
      return NextResponse.json(
        { success: false, error: "Missing eventId" },
        { status: 400 }
      );
    }

    if (body.operationType === "ATTENDANCE" && body.eventId) {
      const auth = await requireEventPermission(body.eventId, Permission.SCAN_ATTENDANCE);
      if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.message }, { status: auth.reason === "NOT_AUTHENTICATED" ? 401 : 403 });
      }
    }

    if (body.operationType === "KIT" && body.eventId) {
      const auth = await requireEventPermission(body.eventId, Permission.SCAN_KIT);
      if (!auth.ok) {
        return NextResponse.json({ success: false, error: auth.message }, { status: auth.reason === "NOT_AUTHENTICATED" ? 401 : 403 });
      }
    }

    if (body.operationType === "OTHER") {
      if (body.eventId) {
        const auth = await requireEventPermission(body.eventId, Permission.SCAN_ATTENDANCE);
        if (!auth.ok) {
          return NextResponse.json({ success: false, error: auth.message }, { status: auth.reason === "NOT_AUTHENTICATED" ? 401 : 403 });
        }
      } else {
        const auth = await authorizeScannerActor();
        if (!auth.ok) {
          return NextResponse.json({ success: false, error: auth.message }, { status: auth.reason === "NOT_AUTHENTICATED" ? 401 : 403 });
        }
      }
    }

    // Process the scan
    const payload: QRScanPayload = {
      qrToken: body.qrToken,
      qrData: body.qrData || scanValue,
      stationId: body.stationId,
      eventId: body.eventId,
      operationType: body.operationType,
      timestamp: new Date(),
    };

    const result = await processQRScan(db, payload);

    if (result.success) {
      return NextResponse.json({
        success: true,
        userId: result.userId,
        shacklesId: result.shacklesId,
        userName: result.userName,
        message: result.message,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          userId: result.userId,
          userName: result.userName,
        },
        { status: 400 }
      );
    }
  } catch (err) {
    console.error("QR scan endpoint error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
