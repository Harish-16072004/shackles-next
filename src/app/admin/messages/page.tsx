import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Pagination from "@/components/ui/Pagination";

const PAGE_SIZE = 20;

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

export default async function AdminMessagesPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const session = await getSession();
  if (!session?.userId) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({ where: { id: session.userId as string } });
  if (!currentUser || currentUser.role !== "ADMIN") {
    redirect("/login");
  }

  // Fetch paginated contact messages, newest first
  const currentPage = Math.max(1, parseInt(typeof searchParams?.page === "string" ? searchParams.page : "1", 10) || 1);

  const [messages, totalMessages] = await Promise.all([
    prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.contactMessage.count(),
  ]);

  const totalPages = Math.ceil(totalMessages / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Contact Messages</h1>
          <p className="text-gray-600">View and respond to inquiries submitted via the contact form.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Total Messages: {totalMessages}
            </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 min-w-[150px]">Date sent</th>
                  <th className="px-4 py-3 min-w-[200px]">Sender Details</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50 group">
                    <td className="px-4 py-3 align-top text-xs text-gray-600">
                      {formatDate(msg.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-gray-900">{msg.name}</div>
                      <div className="text-xs text-blue-600 hover:underline">
                        <a href={`mailto:${msg.email}`}>{msg.email}</a>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        <a href={`tel:${msg.mobile}`} className="hover:underline">{msg.mobile}</a>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700 max-w-2xl">
                      <p className="border-l-2 border-gray-200 pl-3 italic text-gray-800">
                        "{msg.message}"
                      </p>
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <a 
                        href={`mailto:${msg.email}?subject=Re: Inquiry to Shackles Symposium`} 
                        className="inline-flex items-center text-xs px-3 py-1.5 bg-black text-white rounded font-medium hover:bg-gray-800 transition-colors"
                      >
                        Reply Via Email
                      </a>
                    </td>
                  </tr>
                ))}

                {messages.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-gray-500 text-sm">
                      No messages received yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} baseUrl="/admin/messages" />
      </div>
    </div>
  );
}
