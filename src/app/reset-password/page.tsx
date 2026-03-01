import ResetPasswordForm from "@/components/features/ResetPasswordForm";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: { token: string };
}) {
  const token = searchParams.token;
  let isValid = false;
  let errorMessage = "";

  if (!token) {
    errorMessage = "Invalid or missing token.";
  } else {
    try {
      // Basic check if token exists and is valid
      const user = await prisma.user.findUnique({
        where: { resetToken: token }
      });

      if (!user) {
        errorMessage = "Invalid reset token.";
      } else if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
        errorMessage = "This reset link has expired.";
      } else {
        isValid = true;
      }
    } catch (e) {
      console.error(e);
      errorMessage = "Server error verifying token.";
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your new password below.</p>
        </div>

        {!isValid ? (
          <div className="text-center">
            <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {errorMessage}
            </div>
            <Link href="/forgot-password" className="text-blue-600 hover:underline text-sm">
              Request a new reset link
            </Link>
          </div>
        ) : (
          <ResetPasswordForm token={token} />
        )}
      </div>
    </div>
  );
}
