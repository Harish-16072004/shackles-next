'use server'

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { sendResetEmail } from "@/lib/email";
import crypto from "crypto";

const prisma = new PrismaClient();

export async function requestPasswordReset(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;

  if (!email || !email.includes("@")) {
    return { error: "Please enter a valid email." };
  }

  try {
    // 1. Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    
    // Security: If user doesn't exist, don't tell them. Fake success to stop hackers scanning emails.
    if (!user) {
      return { success: true, message: "If an account exists, we sent a reset link." };
    }

    // 2. Generate a secure random token
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // Expires in 15 minutes

    // 3. Save token to DB
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        resetToken: token,
        resetTokenExpiry: expiry
      }
    });

    // 4. Send the Email
    const result = await sendResetEmail(email, token);
    
    if (!result.success) {
      return { error: "Failed to connect to Gmail. Try again." };
    }

    return { success: true, message: "Check your email for the reset link!" };

  } catch (error) {
    console.error(error);
    return { error: "Something went wrong." };
  }
}