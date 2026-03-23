import { PaymentStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { verifyUserPayment } from "@/server/actions/admin";
import { prisma } from "@/lib/prisma";
import { getPaymentProofSignedUrl } from "@/lib/storage/signed-urls";

function formatINR(amount?: number | null) {
  if (amount == null) return "₹0";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(date?: Date | null) {
  if (!date) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function PaymentVerificationPage({ searchParams }: { searchParams?: { status?: string } }) {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/login");
  }

  const activeStatus: PaymentStatus = (() => {
    const raw = (searchParams?.status || "pending").toUpperCase();
    if (raw === "VERIFIED") return "VERIFIED";
    if (raw === "REJECTED") return "REJECTED";
    return "PENDING";
  })();

  const payments = await prisma.payment.findMany({
    where: { status: activeStatus },
    include: {
      user: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const proofUrlByPaymentId = new Map<string, string>();
  for (const payment of payments) {
    const signed = await getPaymentProofSignedUrl(payment.proofPath || payment.proofUrl, 300);
    const resolved = signed || payment.proofUrl;
    if (resolved) {
      proofUrlByPaymentId.set(payment.id, resolved);
    }
  }

  const pendingCount = await prisma.payment.count({ where: { status: "PENDING" } });
  const verifiedCount = await prisma.payment.count({ where: { status: "VERIFIED" } });
  const rejectedCount = await prisma.payment.count({ where: { status: "REJECTED" } });
  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  const filters: Array<{ label: string; value: PaymentStatus }> = [
    { label: `Pending (${pendingCount})`, value: "PENDING" },
    { label: `Verified (${verifiedCount})`, value: "VERIFIED" },
    { label: `Rejected (${rejectedCount})`, value: "REJECTED" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-gray-900">Payment Verification</h1>
            <p className="text-gray-600">Review payment proofs and approve participant IDs.</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/onspot-registration"
              className="inline-flex items-center px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              Open On-Spot Console
            </a>
            <a
              href={`/api/admin/payments/export?status=${activeStatus.toLowerCase()}`}
              className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Download {activeStatus.toLowerCase()} CSV
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</p>
            <p className="mt-2 text-2xl font-bold text-orange-600">{pendingCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Verified</p>
            <p className="mt-2 text-2xl font-bold text-green-600">{verifiedCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (filtered)</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{payments.length}</p>
            <p className="text-sm text-gray-500">{formatINR(totalAmount)} total</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          {filters.map((filter) => {
            const isActive = filter.value === activeStatus;
            return (
              <a
                key={filter.value}
                href={`?status=${filter.value.toLowerCase()}`}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  isActive
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}
              >
                {filter.label}
              </a>
            );
          })}
        </div>

        {/* Payment Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {payments.map((payment) => {
            const user = payment.user;
            const isPending = payment.status === "PENDING";
            const proofUrl = proofUrlByPaymentId.get(payment.id);
            return (
              <div
                key={payment.id}
                className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">{user.firstName} {user.lastName}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    <p className="text-xs text-gray-500">{user.phone}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      user.registrationType === "GENERAL"
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : user.registrationType === "WORKSHOP"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-orange-50 text-orange-700 border-orange-200"
                    }`}
                  >
                    {user.registrationType}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                  <div>
                    <p className="text-gray-500 text-xs uppercase">College</p>
                    <p className="font-medium">{user.collegeName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Department</p>
                    <p className="font-medium">{user.department} - Year {user.yearOfStudy}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Amount</p>
                    <p className="font-semibold">{formatINR(payment.amount)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Registered</p>
                    <p className="font-medium">{formatDate(user.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Transaction ID</p>
                    <p className="font-mono text-xs">{payment.transactionId || "--"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase">Status</p>
                    <p className="font-semibold text-gray-900">{payment.status}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {proofUrl ? (
                    <a
                      className="text-sm font-semibold text-blue-600 hover:underline"
                      href={proofUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View payment proof
                    </a>
                  ) : (
                    <span className="text-sm text-red-500">No proof uploaded</span>
                  )}
                </div>

                {isPending ? (
                  <div className="flex gap-3">
                    <form className="flex-1" action={async () => {
                      "use server";
                      await verifyUserPayment(user.id, "APPROVE");
                    }}>
                      <button className="w-full bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition">
                        Verify & Generate ID
                      </button>
                    </form>
                    <form className="flex-1" action={async () => {
                      "use server";
                      await verifyUserPayment(user.id, "REJECT");
                    }}>
                      <button className="w-full bg-white text-red-600 border border-red-200 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 transition">
                        Reject
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-gray-600">
                    <p>Reviewed on {formatDate(payment.verifiedAt || payment.rejectedAt || payment.createdAt)}</p>
                    <p>Reviewed by {payment.verifiedBy || "--"}</p>
                    {user.shacklesId && (
                      <span className="inline-flex font-mono text-xs bg-gray-900 text-white px-2 py-1 rounded">{user.shacklesId}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {payments.length === 0 && (
            <div className="col-span-full bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-500">
              No payments found for this filter.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
