import { getSession } from "@/lib/session"; 
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AccommodationForm from "@/components/features/AccommodationForm"; 

export default async function AccommodationPage() {
  // 1. Fetch Session Securely on Server
  const session = await getSession();

  // 2. Security Check: If no session, redirect to login
  if (!session || !session.userId) {
    redirect("/login");
  }

  // 3. Check payment verification status
  const user = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: { payment: { select: { status: true } } },
  });

  if (!user || user.payment?.status !== "VERIFIED") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Verification Required</h2>
          <p className="text-sm text-gray-500 mb-6">
            Accommodation registration is available only after your payment has been verified. Please complete your payment and wait for admin approval.
          </p>
          <a
            href="/userDashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 transition-all"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // 4. Pass the userId to the Client Component
  return <AccommodationForm userId={session.userId as string} />;
}