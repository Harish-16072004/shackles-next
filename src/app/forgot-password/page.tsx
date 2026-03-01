'use client'

import { useFormState } from "react-dom";
import { requestPasswordReset } from "@/server/actions/forgot-password";

const initialState = {
  success: false,
  message: "",
  error: "",
};

export default function ForgotPasswordPage() {
  const [state, formAction] = useFormState(requestPasswordReset, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-gray-100">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Forgot Password?</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your email to receive a reset link.</p>
        </div>

        {/* Success Message */}
        {state?.success && (
          <div className="mb-4 p-4 bg-green-50 text-green-700 text-sm rounded-lg border border-green-200">
            {state.message}
          </div>
        )}

        {/* Error Message */}
        {state?.error && (
          <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">Email Address</label>
            <input 
              name="email" 
              type="email" 
              required 
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
              placeholder="you@college.edu" 
            />
          </div>

          <button type="submit" className="w-full px-4 py-2 bg-black text-white rounded-md font-medium hover:bg-gray-800 transition-colors">
            Send Reset Link
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <a href="/login" className="text-gray-500 hover:text-black">← Back to Login</a>
        </div>
      </div>
    </div>
  );
}