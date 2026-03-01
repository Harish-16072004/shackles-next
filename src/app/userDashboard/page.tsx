import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getQrSignedUrl } from "@/lib/storage/signed-urls";
import Image from "next/image";
import LiveSyncRefresher from "@/components/common/LiveSyncRefresher";

export default async function UserDashboardPage() {
  const session = await getSession();

  if (!session?.userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    include: {
      payment: true,
      registrations: {
        include: { event: true },
        orderBy: { event: { name: "asc" } },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const userName = `${user.firstName} ${user.lastName}`.trim();
  const isPaymentVerified = user.payment?.status === "VERIFIED";

  const workshops = user.registrations.filter((registration) => {
    const eventName = registration.event.name.toLowerCase();
    const eventType = (registration.event.type || "").toUpperCase();
    return eventName.includes("workshop") || eventType === "WORKSHOP";
  });

  const events = user.registrations.filter((registration) => {
    const eventName = registration.event.name.toLowerCase();
    const eventType = (registration.event.type || "").toUpperCase();
    return !eventName.includes("workshop") && eventType !== "WORKSHOP";
  });

  const qrValue = user.qrToken;
  const generatedQrFallbackUrl = qrValue
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrValue)}`
    : null;
  const qrSignedUrl = await getQrSignedUrl(user.qrPath, 300);
  const qrImageUrl = qrSignedUrl || user.qrImageUrl || generatedQrFallbackUrl;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <LiveSyncRefresher intervalMs={12000} />
      <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">User Dashboard</p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900 md:text-4xl">Welcome {userName},</h1>
        <p className="mt-2 text-gray-600">Your registration details, QR pass, and enrolled activities.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Your Shackles ID</h2>
          <p className="mt-3 inline-block rounded-md bg-gray-900 px-3 py-2 font-mono text-sm tracking-wider text-white">
            {user.shacklesId || "Pending verification"}
          </p>
          {!user.shacklesId && (
            <p className="mt-2 text-sm text-amber-700">Your Shackles ID will appear once payment verification is completed.</p>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Your QR</h2>
          {isPaymentVerified && qrImageUrl ? (
            <div className="mt-4">
              <Image
                src={qrImageUrl}
                alt="User QR Code"
                width={220}
                height={220}
                unoptimized
                className="rounded-lg border border-gray-200"
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-amber-700">
              QR will be generated only after payment verification.
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Registered Events</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No event registrations yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {events.map((registration) => (
                <li key={registration.id} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                  <div className="font-medium text-gray-900">{registration.event.name}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {registration.teamName ? `Team: ${registration.teamName} • ` : ""}
                    Participants: {registration.teamSize || 1}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Registered Workshops</h2>
          {workshops.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No workshop registrations yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {workshops.map((registration) => (
                <li key={registration.id} className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                  <div className="font-medium text-gray-900">{registration.event.name}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {registration.teamName ? `Team: ${registration.teamName} • ` : ""}
                    Participants: {registration.teamSize || 1}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
