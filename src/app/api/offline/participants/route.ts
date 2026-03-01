import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const hashToken = (token: string | null) => {
  if (!token) return null;
  return crypto.createHash("sha256").update(token).digest("hex");
};

export async function GET() {
  const session = await getSession();
  const role = session?.role as string | undefined;

  if (!session || (role !== "ADMIN" && role !== "COORDINATOR")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["APPLICANT", "PARTICIPANT"] },
        qrToken: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        shacklesId: true,
        registrationType: true,
        kitStatus: true,
        qrToken: true,
        updatedAt: true,
        registrations: {
          select: {
            attended: true,
            event: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    const payload = users.map((user) => ({
      id: user.id,
      firstName: user.firstName,
      shacklesId: user.shacklesId,
      registrationType: user.registrationType,
      kitStatus: user.kitStatus,
      qrTokenHash: hashToken(user.qrToken),
      updatedAt: user.updatedAt,
      events: user.registrations.map((reg) => ({
        eventName: reg.event.name,
        attended: reg.attended,
      })),
    }));

    return NextResponse.json({ participants: payload }, { status: 200 });
  } catch (error) {
    console.error("Offline roster error", error);
    return NextResponse.json({ error: "Failed to fetch participants" }, { status: 500 });
  }
}
