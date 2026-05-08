'use server'

import { prisma } from "@/lib/prisma";
import { sendResetEmail } from "@/lib/email"; 
import crypto from "crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { BCRYPT_ROUNDS } from "@/lib/crypto-config";
import { createRateLimiter, rateLimitPresets } from "@/lib/rate-limit";

// M6: Rate limiter for password reset requests
const resetRateLimiter = createRateLimiter({
  ...rateLimitPresets.auth,
  keyPrefix: "ratelimit:password-reset",
});

// ----------------------------------------------------
// Action 1: Request Password Reset (Send Email)
// ----------------------------------------------------

export async function requestPasswordReset(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;

  // FIX 14: Proper email validation to prevent rate limit bypass via malformed variants
  const emailSchema = z.string().email();
  const emailResult = emailSchema.safeParse(email);
  if (!emailResult.success) {
    return { success: false, error: "Please enter a valid email.", message: "" };
  }
  const normalizedEmail = emailResult.data.toLowerCase();

  // M6: Rate limit by normalized email to prevent spam
  const rateLimitResult = await resetRateLimiter.limit(normalizedEmail);
  if (!rateLimitResult.success) {
    return { success: false, error: "Too many requests. Please try again later.", message: "" };
  }

  try {
    // 1. Check if user exists
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    
    // Security: If user doesn't exist, don't tell them. Fake success to stop hackers scanning emails.
    if (!user) {
      // Don't leak user existence
      return { success: true, message: "If an account exists, we sent a reset link to your email.", error: "" };
    }

    // C4: Generate a secure random token and hash it before storing
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    
    // Set expiry to 15 minutes from now
    const expiry = new Date(Date.now() + 15 * 60 * 1000); 

    // 3. Save hashed token to DB (raw token is sent in the email)
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetToken: hashedToken,
        resetTokenExpiry: expiry
      }
    });

    // 4. Send the Email with the RAW token (not the hash)
    const sendResult = await sendResetEmail(normalizedEmail, rawToken);
    
    if (sendResult.success) {
      return { success: true, message: "Check your email for the reset link!", error: "" };
    } else {
      return { success: false, error: "Failed to send email. Please try again later.", message: "" };
    }

  } catch (error) {
    console.error("Forgot Password Error:", error);
    return { success: false, error: "Something went wrong.", message: "" };
  }
}

// ----------------------------------------------------
// Action 2: Reset Password (Updates DB)
// ----------------------------------------------------

const passwordResetSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export async function resetPassword(prevState: unknown, formData: FormData) {
  // Convert formData to object for validation
  const rawData = {
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  };

  const validation = passwordResetSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues.map(e => e.message).join(", "),
      message: ""
    };
  }

  const { token, newPassword } = validation.data;

  try {
    // C4: Hash the incoming token before querying the DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // 1. Find user with this hashed token
    const user = await prisma.user.findUnique({
      where: { resetToken: hashedToken }
    });

    if (!user) {
      return { success: false, error: "Invalid or expired reset token.", message: "" };
    }

    // 2. Check if token is expired
    if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
      return { success: false, error: "This reset link has expired. Please request a new one.", message: "" };
    }

    // 3. Hash new password with centralized cost factor
    const hashedPassword = await hash(newPassword, BCRYPT_ROUNDS);

    // 4. Update user password and clear token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null
      }
    });

    // Success response should ideally redirect, but we'll return success: true
    // creating a success message for UI to handle redirect or show link
    return { success: true, message: "Password reset successfully! You can now login.", error: "" };

  } catch (error) {
    console.error("Reset Password Error:", error);
    return { success: false, error: "Failed to reset password. Please try again.", message: "" };
  }
}
