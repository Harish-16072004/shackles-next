'use server'

import { prisma } from "@/lib/prisma";
import { sendResetEmail } from "@/lib/email"; 
import crypto from "crypto";
import { hash } from "bcryptjs";
import { z } from "zod";

// ----------------------------------------------------
// Action 1: Request Password Reset (Send Email)
// ----------------------------------------------------

export async function requestPasswordReset(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;

  if (!email || !email.includes("@")) {
    return { success: false, error: "Please enter a valid email.", message: "" };
  }

  try {
    // 1. Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Security: If user doesn't exist, don't tell them. Fake success to stop hackers scanning emails.
    if (!user) {
      // Don't leak user existence
      return { success: true, message: "If an account exists, we sent a reset link to your email.", error: "" };
    }

    // 2. Generate a secure random token
    // Generates a random 32-byte hex string (64 chars)
    const token = crypto.randomBytes(32).toString("hex");
    
    // Set expiry to 15 minutes from now
    const expiry = new Date(Date.now() + 15 * 60 * 1000); 

    // 3. Save token to DB
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetToken: token,
        resetTokenExpiry: expiry
      }
    });

    // 4. Send the Email
    // Using the sendResetEmail function which logs the link for dev environment
    const emailResult = await sendResetEmail(email, token);
    
    if (emailResult.success) {
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
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password must be at least 6 characters"),
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
      error: validation.error.errors.map(e => e.message).join(", "),
      message: ""
    };
  }

  const { token, newPassword } = validation.data;

  try {
    // 1. Find user with this token
    const user = await prisma.user.findUnique({
      where: { resetToken: token }
    });

    if (!user) {
      return { success: false, error: "Invalid or expired reset token.", message: "" };
    }

    // 2. Check if token is expired
    if (!user.resetTokenExpiry || new Date() > user.resetTokenExpiry) {
      return { success: false, error: "This reset link has expired. Please request a new one.", message: "" };
    }

    // 3. Hash new password
    const hashedPassword = await hash(newPassword, 10);

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
