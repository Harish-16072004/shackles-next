'use server'

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import crypto from "crypto"; 

const prisma = new PrismaClient();

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
  proofUrl: z.string().url("Invalid Image URL"), 
});

export async function registerFullUser(data: any) {
  const result = FullRegisterSchema.safeParse(data);
  
  if (!result.success) {
    return { success: false, error: "Invalid Data. Please check all fields." };
  }

  // Extract registrationType specifically
  const { password, amount, transactionId, proofUrl, registrationType, ...personalDetails } = result.data;

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
    
    // Generate Secure QR Token
    const qrRaw = crypto.randomBytes(32).toString('hex');
    const qrExpiry = new Date();
    qrExpiry.setDate(qrExpiry.getDate() + 30); 

    // C. Create User
    await prisma.user.create({
      data: {
        ...personalDetails,
        password: hashedPassword,
        role: "APPLICANT",
        
        // --- SAVE THE TYPE ---
        registrationType: registrationType, 
        
        // Save QR Data
        qrToken: qrRaw,
        qrTokenExpiry: qrExpiry,
        
        // Save Payment
        payment: {
          create: {
            amount,
            transactionId,
            proofUrl: proofUrl, 
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