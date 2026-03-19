import { RegistrationType, PaymentStatus, KitStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getPaymentProofSignedUrl } from "@/lib/storage/signed-urls";
import type { Prisma } from "@prisma/client";

function parseFilter<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T | undefined) {
  if (!value) return fallback;
  const upper = value.toUpperCase();
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : fallback;
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

export default async function UserManagementPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/login");
  }

  const search = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";
  const regType = parseFilter<RegistrationType>(typeof searchParams?.type === "string" ? searchParams.type : undefined, ["GENERAL", "WORKSHOP", "COMBO"], undefined);
  const paymentStatus = parseFilter<PaymentStatus>(typeof searchParams?.payment === "string" ? searchParams.payment : undefined, ["PENDING", "VERIFIED", "REJECTED"], undefined);
  const kitStatus = parseFilter<KitStatus>(typeof searchParams?.kit === "string" ? searchParams.kit : undefined, ["PENDING", "ISSUED"], undefined);
  const sort = typeof searchParams?.sort === "string" ? searchParams.sort : "date-desc";

  const where: Prisma.UserWhereInput = {
    role: { in: ["APPLICANT", "PARTICIPANT"] },
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { collegeName: { contains: search, mode: "insensitive" } },
    ];
  }

  if (regType) {
    where.registrationType = regType;
  }

  if (kitStatus) {
    where.kitStatus = kitStatus;
  }

  if (paymentStatus) {
    where.payment = { status: paymentStatus };
  }

  const orderBy = (() => {
    switch (sort) {
      case "name-asc":
        return [{ firstName: "asc" as const }, { lastName: "asc" as const }];
      case "name-desc":
        return [{ firstName: "desc" as const }, { lastName: "desc" as const }];
      case "type":
        return [{ registrationType: "asc" as const }];
      default:
        return [{ createdAt: "desc" as const }];
    }
  })();

  const [users, totalRegistered, verifiedPayments, pendingPayments, rejectedPayments, generalOnly, workshopOnly, combo, kitsIssued] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { payment: true },
      orderBy,
    }),
    prisma.user.count({ where: { role: { in: ["APPLICANT", "PARTICIPANT"] } } }),
    prisma.payment.count({ where: { status: "VERIFIED" } }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.payment.count({ where: { status: "REJECTED" } }),
    prisma.user.count({ where: { role: { in: ["APPLICANT", "PARTICIPANT"] }, registrationType: "GENERAL" } }),
    prisma.user.count({ where: { role: { in: ["APPLICANT", "PARTICIPANT"] }, registrationType: "WORKSHOP" } }),
    prisma.user.count({ where: { role: { in: ["APPLICANT", "PARTICIPANT"] }, registrationType: "COMBO" } }),
    prisma.user.count({ where: { kitStatus: "ISSUED" } }),
  ]);

  const summaryCards = [
    { label: "Total Registered", value: totalRegistered },
    { label: "Payment Verified", value: verifiedPayments },
    { label: "Payment Pending", value: pendingPayments },
    { label: "Payment Rejected", value: rejectedPayments },
    { label: "General Only", value: generalOnly },
    { label: "Workshop Only", value: workshopOnly },
    { label: "Both", value: combo },
    { label: "Kits Issued", value: kitsIssued },
  ];

  const filters = {
    type: [
      { label: "All types", value: "" },
      { label: "General", value: "GENERAL" },
      { label: "Workshop", value: "WORKSHOP" },
      { label: "Combo", value: "COMBO" },
    ],
    payment: [
      { label: "All payment status", value: "" },
      { label: "Pending", value: "PENDING" },
      { label: "Verified", value: "VERIFIED" },
      { label: "Rejected", value: "REJECTED" },
    ],
    kit: [
      { label: "All kit status", value: "" },
      { label: "Pending", value: "PENDING" },
      { label: "Issued", value: "ISSUED" },
    ],
    sort: [
      { label: "Sort by Date (newest)", value: "date-desc" },
      { label: "Sort by Name (A-Z)", value: "name-asc" },
      { label: "Sort by Name (Z-A)", value: "name-desc" },
      { label: "Sort by Type", value: "type" },
    ],
  };

  const proofUrlByUserId = new Map<string, string>();
  for (const user of users) {
    const signed = await getPaymentProofSignedUrl(user.payment?.proofPath || user.payment?.proofUrl, 300);
    const resolved = signed || user.payment?.proofUrl;
    if (resolved) {
      proofUrlByUserId.set(user.id, resolved);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-600">Manage participants, payments, and kit status.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <form method="get" className="flex flex-col md:flex-row gap-3 md:items-center">

            <div className="flex flex-wrap gap-2 md:flex-nowrap md:w-full">
              <select className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" name="type" defaultValue={regType || ""}>
                {filters.type.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" name="payment" defaultValue={paymentStatus || ""}>
                {filters.payment.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" name="kit" defaultValue={kitStatus || ""}>
                {filters.kit.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" name="sort" defaultValue={sort}>
                {filters.sort.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 md:flex-none">
              <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                Apply
              </button>
              <a href="/admin/users" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                Reset
              </a>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Participant ID</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Kit Status</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 align-top text-xs font-mono text-gray-700">{user.shacklesId || "--"}</td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-gray-900">{user.firstName} {user.lastName}</div>
                      <div className="text-xs text-gray-500">{user.department} • Year {user.yearOfStudy}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700">{user.email}</td>
                    <td className="px-4 py-3 align-top text-gray-700">{user.phone}</td>
                    <td className="px-4 py-3 align-top text-gray-700">{user.collegeName}</td>
                    <td className="px-4 py-3 align-top">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                          user.registrationType === "GENERAL"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : user.registrationType === "WORKSHOP"
                            ? "bg-purple-50 text-purple-700 border-purple-200"
                            : "bg-orange-50 text-orange-700 border-orange-200"
                        }`}
                      >
                        {user.registrationType}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-xs font-semibold text-gray-900">{user.payment?.status || "PENDING"}</div>
                      <div className="text-xs text-gray-500">₹ {user.payment?.amount ?? 0}</div>
                      {proofUrlByUserId.get(user.id) ? (
                        <a
                          className="text-xs text-blue-600 font-semibold hover:underline"
                          href={proofUrlByUserId.get(user.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Proof
                        </a>
                      ) : (
                        <span className="text-xs text-red-500">No proof</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs font-semibold text-gray-900">{user.kitStatus}</td>
                    <td className="px-4 py-3 align-top text-xs text-gray-600">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3 align-top text-xs text-blue-600 font-semibold">
                      <a className="hover:underline" href={`/admin/payments?status=pending&q=${encodeURIComponent(user.email)}`}>
                        Review payment
                      </a>
                    </td>
                  </tr>
                ))}

                {users.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No participants match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
