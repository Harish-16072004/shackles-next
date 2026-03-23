import OnSpotRegistrationForm from '@/components/features/OnSpotRegistrationForm';
import { getActiveYearShort } from '@/lib/edition';

export default function OnSpotRegistrationPage() {
  const activeYearShort = getActiveYearShort();

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">Shackles &apos;{activeYearShort} On-Spot Registration</h1>
          <p className="mt-2 text-gray-600">
            Submit your details and payment info. Your account is activated after admin verification.
          </p>
        </div>

        <OnSpotRegistrationForm />
      </div>
    </div>
  );
}
