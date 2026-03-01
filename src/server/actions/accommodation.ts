'use server'

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const AccommodationSchema = z.object({
  userId: z.string(),
  gender: z.enum(["MALE", "FEMALE"]),
  days: z.array(z.string()).min(1, "Select at least one day"),
});

export async function registerAccommodation(data: unknown) {
  const result = AccommodationSchema.safeParse(data);
  
  if (!result.success) {
    return { success: false, error: "Please select gender and at least one day." };
  }

  try {
    // Check if already registered
    const existing = await prisma.accommodation.findUnique({
      where: { userId: result.data.userId }
    });

    if (existing) {
      return { success: false, error: "You have already requested accommodation." };
    }

    // Save to DB
    await prisma.accommodation.create({
      data: {
        userId: result.data.userId,
        gender: result.data.gender,
        days: result.data.days
      }
    });

    revalidatePath('/accommodation');
    return { success: true };

  } catch (error) {
    console.error("Accommodation Error:", error);
    return { success: false, error: "Failed to register request." };
  }
}