'use server'

import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

// 1. Define the Validation Schema (The Rules)
const RegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be valid"),
  college: z.string().min(2, "College name is required"),
});

// 2. The Server Action (The Function)
export async function registerUser(prevState: any, formData: FormData) {
  // Extract data from the form
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    college: formData.get("college"),
  };

  // Validate the data
  const validatedFields = RegisterSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      message: "Validation Error",
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  // Save to Database
  try {
    await prisma.user.create({
      data: {
        ...validatedFields.data,
        // We generate a random "Shackles ID" for now (e.g., SH-1234)
        shacklesId: `SH-${Math.floor(1000 + Math.random() * 9000)}`,
      },
    });
  } catch (e) {
    return { message: "Email already registered. Try logging in." };
  }

  // Success! Redirect to the Dashboard
  redirect("/dashboard");
}