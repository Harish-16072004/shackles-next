import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Prisma } from "@prisma/client";
import { Download } from "lucide-react";

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

export default async function AdminAccommodationsPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) redirect("/login");

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") redirect("/login");

  const genderFilter = typeof searchParams?.gender === "string" ? searchParams.gender : "";
  const search = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";

  const where: Prisma.AccommodationWhereInput = {};
  if (genderFilter) {
    where.gender = genderFilter;
  }
  if (search) {
    where.OR = [
      { user: { firstName: { contains: search, mode: "insensitive" } } },
      { user: { lastName: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      { user: { phone: { contains: search, mode: "insensitive" } } },
      { user: { collegeName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const accommodations = await prisma.accommodation.findMany({
    where,
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  const total = accommodations.length;
  const male = accommodations.filter((a) => a.gender === "MALE").length;
  const female = accommodations.filter((a) => a.gender === "FEMALE").length;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Accommodation Management</h1>
            <p className="text-gray-600">Review participant accommodation requests.</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/api/admin/accommodations/download?gender=MALE"
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download Male
            </a>
            <a
              href="/api/admin/accommodations/download?gender=FEMALE"
              download
              className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Download Female
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase">Total Requests</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{total}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase">Male</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{male}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs">
            <p className="text-xs font-semibold text-gray-500 uppercase">Female</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{female}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">College</th>
                  <th className="px-4 py-3">Gender</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Requested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accommodations.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{acc.user.firstName} {acc.user.lastName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{acc.user.email}</td>
                    <td className="px-4 py-3 text-gray-700">{acc.user.phone}</td>
                    <td className="px-4 py-3 text-gray-700">{acc.user.collegeName}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-gray-900">{acc.gender}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{acc.days.join(", ")}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(acc.createdAt)}</td>
                  </tr>
                ))}

                {accommodations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No accommodation requests found.
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
