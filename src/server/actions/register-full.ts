'use server'

import { z } from "zod";
import { hash } from "bcryptjs";
import { BCRYPT_ROUNDS } from "@/lib/crypto-config";
import { prisma } from "@/lib/prisma";
import { createRateLimiter, rateLimitPresets } from "@/lib/rate-limit";

const registrationRateLimiter = createRateLimiter({
  ...rateLimitPresets.auth,
  keyPrefix: "ratelimit:registration",
});

function normalizeIndianPhone(value: string) {
  const trimmed = value.replace(/[\s-]/g, "");
  const match = trimmed.match(/^(?:\+91|91)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

const FullRegisterSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z
    .string()
    .transform((value) => normalizeIndianPhone(value))
    .refine((value): value is string => Boolean(value), {
      message: "Invalid Indian mobile number",
    }),
  collegeName: z.string().min(2),
  collegeLoc: z.string().min(2),
  department: z.string().min(2),
  yearOfStudy: z.string(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  password: z.string().min(8),
  
  // --- NEW FIELDS ---
  registrationType: z.enum(["GENERAL", "WORKSHOP", "COMBO"]),
  
  // Payment
  amount: z.number(),
  transactionId: z.string().min(4),
  proofUrl: z.string().url("Invalid Image URL").optional(),
  proofPath: z.string().min(1).optional(),
});

export async function registerFullUser(data: unknown) {
  const result = FullRegisterSchema.safeParse(data);
  
  if (!result.success) {
    return { success: false, error: "Invalid Data. Please check all fields." };
  }

  // FIX 5: Rate limit by email to prevent registration spam
  const rateLimitResult = await registrationRateLimiter.limit(result.data.email.toLowerCase());
  if (!rateLimitResult.success) {
    return { success: false, error: "Too many registration attempts. Please try again later." };
  }

  // Extract registrationType specifically
  const { password, amount, transactionId, proofUrl, proofPath: inputProofPath, registrationType, ...personalDetails } = result.data;
  if (!proofUrl && !inputProofPath) {
    return { success: false, error: "Payment proof is required." };
  }

  try {
    // A. Check for existing user
    const existing = await prisma.user.findUnique({
      where: { email: personalDetails.email }
    });
    if (existing) {
      return { success: false, error: "Email already registered." };
    }

    // B. Security Prep
    const hashedPassword = await hash(password, BCRYPT_ROUNDS);

    const proofPath: string | undefined = inputProofPath;

    // D. Create User
    await prisma.user.create({
      data: {
        ...personalDetails,
        password: hashedPassword,
        role: "APPLICANT",
        
        // --- SAVE THE TYPE ---
        registrationType: registrationType,
        
        // Save Payment
        payment: {
          create: {
            amount,
            transactionId,
            proofUrl: proofUrl || "",
            proofPath,
            status: "PENDING"
          }
        }
      }
    });

    return { success: true };

  } catch (error) {
    console.error("Registration Error:", error);
    return { success: false, error: "Registration failed. Please try again." };
  }
}