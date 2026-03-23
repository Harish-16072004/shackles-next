import RegistrationForm from "@/components/features/RegistrationForm";
import { getActiveYearShort } from "@/lib/edition";

export default function RegisterPage() {
  const activeYearShort = getActiveYearShort();

  return (
    <div className="min-h-screen py-10 bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Shackles &apos;{activeYearShort} Registration</h1>
          <p className="text-gray-500 mt-2">Complete your profile to join the symposium.</p>
        </div>

        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">Walking in to campus for on-spot entry?</p>
          <p className="mt-1">Use the self-service form and wait for organizer verification.</p>
          <a
            href="/onspot-registration"
            className="mt-3 inline-flex rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Open on-spot registration
          </a>
        </div>
        
        <RegistrationForm yearShort={activeYearShort} />
        
      </div>
    </div>
  );
}