'use server'

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs"; // The security tool
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

// 1. Strict Validation Rules
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
  
  // Payment Details
  amount: z.number(),
  transactionId: z.string().min(4),
  proofUrl: z.string().optional(), // We will handle real file uploads later
});

// 2. The Main Function
export async function registerFullUser(data: any) {
  // Validate Data
  const result = FullRegisterSchema.safeParse(data);
  
  if (!result.success) {
    return { success: false, error: "Invalid Data. Please check all fields." };
  }

  const { password, amount, transactionId, proofUrl, ...personalDetails } = result.data;

  try {
    // A. Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: personalDetails.email }
    });
    if (existing) {
      return { success: false, error: "Email already registered." };
    }

    // B. Encrypt Password
    const hashedPassword = await hash(password, 10);

    // C. Save Everything (User + Payment) in one go
    await prisma.user.create({
      data: {
        ...personalDetails,
        password: hashedPassword,
        payment: {
          create: {
            amount,
            transactionId,
            proofUrl: proofUrl || "pending_upload",
            status: "PENDING"
          }
        }
      }
    });

    return { success: true };

  } catch (error) {
    console.error(error);
    return { success: false, error: "Database Error. Try again." };
  }
}