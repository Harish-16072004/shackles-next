'use server'

import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Initialize Prisma
// const prisma = new PrismaClient();

const ContactSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Invalid email address"),
  mobile: z.string().min(10, "Mobile number must be at least 10 digits"),
  message: z.string().min(10, "Message is too short"),
});

export async function submitContactForm(data: unknown) {
  const result = ContactSchema.safeParse(data);

  if (!result.success) {
    // Return the first error message
    return { success: false, error: result.error.errors[0].message };
  }

  const { name, email, mobile, message } = result.data;

  try {
    // 1. Try to find a user with this email to link them
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    // 2. Save the message to the database
    await prisma.contactMessage.create({
      data: {
        name,
        email,
        mobile,
        message,
        userId: user ? user.id : undefined // Link user ID if found, else null
      }
    });

    return { success: true };

  } catch (error) {
    console.error("Contact Form Error:", error);
    return { success: false, error: "Failed to send message. Please try again." };
  }
}
