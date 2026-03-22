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
        
        <RegistrationForm yearShort={activeYearShort} />
        
      </div>
    </div>
  );
}