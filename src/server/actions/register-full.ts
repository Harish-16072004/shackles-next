'use server'

import { z } from "zod";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

const FullRegisterSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  collegeName: z.string().min(2),
  collegeLoc: z.string().min(2),
  department: z.string().min(2),
  yearOfStudy: z.string(),
  password: z.string().min(6),
  
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
    const hashedPassword = await hash(password, 10);

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