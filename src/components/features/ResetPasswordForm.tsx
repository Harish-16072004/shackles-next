'use client'

import { useFormState } from "react-dom";
import { resetPassword } from "@/server/actions/forgot-password";
import Link from "next/link";

const initialState = {
  message: "",
  error: "",
  success: false
};

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(resetPassword, initialState);

  if (state?.success) {
    return (
      <div className="text-center p-8 bg-green-50 rounded-xl border border-green-200">
        <h2 className="text-2xl font-bold text-green-800 mb-4">Success!</h2>
        <p className="text-green-700 mb-6">{state.message}</p>
        <Link href="/login" className="px-6 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition">
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Hidden Token Field */}
      <input type="hidden" name="token" value={token} />

      {/* Error Message */}
      {state?.error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {state.error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">New Password</label>
        <input 
          name="newPassword" 
          type="password" 
          required 
          minLength={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-gray-700">Confirm Password</label>
        <input 
          name="confirmPassword" 
          type="password" 
          required 
          minLength={6}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
        />
      </div>

      <button type="submit" className="w-full px-4 py-2 bg-black text-white rounded-md font-medium hover:bg-gray-800 transition-colors">
        Reset Password
      </button>
    </form>
  );
}
