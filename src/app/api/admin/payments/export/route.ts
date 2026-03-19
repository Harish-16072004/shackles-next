import { PaymentStatus } from "@prisma/client";
import { stringifyCsvRow } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function assertAdmin() {
  const session = await getSession();
  if (!session?.userId) return false;
  const user = await prisma.user.findUnique({ where: { id: String(session.userId) } });
  return user?.role === "ADMIN";
}

function parseStatus(raw: string | null): PaymentStatus | null {
  const value = (raw || "VERIFIED").toUpperCase();
  if (value === "PENDING") return "PENDING";
  if (value === "VERIFIED") return "VERIFIED";
  if (value === "REJECTED") return "REJECTED";
  if (value === "ALL") return null;
  return "VERIFIED";
}

export async function GET(request: Request) {
  const isAdmin = await assertAdmin();
  if (!isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = parseStatus(searchParams.get("status"));

  const payments = await prisma.payment.findMany({
    where: status ? { status } : undefined,
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  const lines = [
    stringifyCsvRow([
      "name",
      "phone",
      "email",
      "college",
      "department",
      "year",
      "amount",
      "transactionId",
      "status",
      "registeredAt",
      "verifiedAt",
      "verifiedBy",
      "rejectedAt",
      "shacklesId",
    ]),
    ...payments.map((payment) =>
      stringifyCsvRow([
        `${payment.user.firstName} ${payment.user.lastName}`,
        payment.user.phone,
        payment.user.email,
        payment.user.collegeName,
        payment.user.department,
        payment.user.yearOfStudy,
        payment.amount,
        payment.transactionId,
        payment.status,
        payment.createdAt.toISOString(),
        payment.verifiedAt?.toISOString() || "",
        payment.verifiedBy || "",
        payment.rejectedAt?.toISOString() || "",
        payment.user.shacklesId || "",
      ])
    ),
  ];

  const statusSegment = status || "ALL";
  const fileName = `payment-verifications-${String(statusSegment).toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
