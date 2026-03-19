import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: session.userId as string },
    });

    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const gender = request.nextUrl.searchParams.get("gender");
    if (!gender || !["MALE", "FEMALE"].includes(gender)) {
      return NextResponse.json(
        { error: "Invalid gender parameter" },
        { status: 400 }
      );
    }

    const where: Prisma.AccommodationWhereInput = { gender };

    const accommodations = await prisma.accommodation.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    // Generate CSV
    const headers = [
      "Name",
      "Phone",
      "Email",
      "College",
      "Gender",
      "Dates on Stay",
    ];

    const rows = accommodations.map((acc) => [
      `${acc.user.firstName} ${acc.user.lastName}`,
      acc.user.phone,
      acc.user.email,
      acc.user.collegeName,
      acc.gender,
      acc.days.join("; "),
    ]);

    // Escape CSV values
    const escapeCsvValue = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.map(escapeCsvValue).join(","),
      ...rows.map((row) => row.map(escapeCsvValue).join(",")),
    ].join("\n");

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `accommodations-${gender.toLowerCase()}-${timestamp}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[accommodations download]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
