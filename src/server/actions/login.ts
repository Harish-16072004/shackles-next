'use server'

import { z } from "zod";
import { compare } from "bcryptjs"; 
import { createSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";


const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginUser(prevState: unknown, formData: FormData) {
  const data = Object.fromEntries(formData.entries());
  let loggedInRole: string | null = null;
  
  // 1. Validate Input
  const result = LoginSchema.safeParse(data);
  if (!result.success) {
    return { error: "Invalid email or password format." };
  }

  const { email, password } = result.data;

  try {
    // 2. Find User
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return { error: "Invalid credentials." };
    }

    // 3. Check Password
    const passwordsMatch = await compare(password, user.password);
    if (!passwordsMatch) {
      return { error: "Invalid credentials." };
    }

    // 4. Create Session
    await createSession(user.id, user.role);
    loggedInRole = user.role;

  } catch (error) {
    console.error("Login error:", error);
    return { error: "Something went wrong." };
  }

  // 5. Redirect (Must be outside try-catch)
  if (loggedInRole === "ADMIN") {
    redirect("/admin/adminDashboard");
  }

  redirect("/");
}