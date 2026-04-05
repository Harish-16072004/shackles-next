import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Terms and Conditions for the symposium.',
};

export default function TermsAndConditionsPage() {
  const terms = [
    "Open to all undergraduate engineering students with a valid ID.",
    "Registration must be completed before the deadline.",
    "Registration fees are non-refundable.",
    "Participants can join multiple events if schedules don't clash. Judges' decisions are final.",
    "Discipline and professional conduct are expected; plagiarism, ragging, or misbehavior will lead to disqualification.",
    "All submissions must be original. By registering, you consent to event photos/videos being used for promotion.",
    "Certificates and prizes will be awarded as per event rules.",
    "Organizers reserve the right to modify or cancel events if required."
  ];

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 text-gray-900">
      <div className="max-w-3xl w-full bg-white border border-gray-200 p-8 md:p-12 rounded-xl shadow-sm">
        
        <div className="text-center mb-10 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Terms and Conditions
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Please read these terms carefully before registering.
          </p>
        </div>

        <div className="space-y-5">
          {terms.map((term, index) => (
            <div key={index} className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
              <span className="flex-shrink-0 text-lg font-semibold text-gray-400 w-8 text-right">
                {index + 1}.
              </span>
              <p className="text-base leading-relaxed text-gray-700 mt-0.5">
                {term}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
