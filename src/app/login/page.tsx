'use client'

import { useFormState } from "react-dom";
import { loginUser } from "@/server/actions/login";

const initialState = {
  error: "",
};

export default function LoginPage() {
  const [state, formAction] = useFormState(loginUser, initialState);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Welcome Back</h1>
          <p className="text-gray-500 text-sm">Login to your dashboard</p>
        </div>

        <form action={formAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input name="email" type="email" required className="input-field" placeholder="you@college.edu" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input name="password" type="password" required className="input-field" placeholder="••••••••" />
          </div>

          {state?.error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded text-center">
              {state.error}
            </div>
          )}

          <button type="submit" className="btn-primary w-full">
            Login
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <a href="/register" className="text-gray-500 hover:text-black">Need an account? Register</a>
          <span className="mx-2">|</span>
          <a href="/forgot-password" className="text-gray-500 hover:text-black">Forgot Password?</a>
        </div>
      </div>
    </div>
  );
}