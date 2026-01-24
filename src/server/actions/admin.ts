'use server'

import { PrismaClient } from "@prisma/client";
import { revalidatePath } from "next/cache";

const prisma = new PrismaClient();

export async function verifyUserPayment(userId: string, action: 'APPROVE' | 'REJECT') {
  try {
    if (action === 'REJECT') {
      await prisma.payment.update({
        where: { userId },
        data: { 
          status: 'REJECTED',
          rejectedAt: new Date()
        }
      });
    } else {
      // 1. Fetch the user to check their Registration Type
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return { success: false, error: "User not found" };

      // 2. Determine Prefix based on Type
      // General -> SH26EN...
      // Workshop -> SH26WK...
      // Combo -> SH26GN...
      let prefix = "SH26EN"; 
      if (user.registrationType === 'WORKSHOP') prefix = "SH26WK";
      if (user.registrationType === 'COMBO')    prefix = "SH26GN";

      // 3. Count ONLY verified users in this specific category
      // This ensures SH26EN001 and SH26WK001 are separate counters
      const count = await prisma.user.count({ 
        where: { 
          role: 'PARTICIPANT', 
          registrationType: user.registrationType 
        } 
      });

      // 4. Generate the ID (Prefix + 3-digit number)
      // Example: SH26GN + 001 = SH26GN001
      const nextId = (count + 1).toString().padStart(2,'0');
      const shacklesId = `${prefix}${nextId}`;

      // 5. Update Database
      await prisma.$transaction([
        prisma.payment.update({
          where: { userId },
          data: { 
            status: 'VERIFIED', 
            verifiedAt: new Date() 
          }
        }),
        prisma.user.update({
          where: { id: userId },
          data: {
            role: 'PARTICIPANT',
            shacklesId: shacklesId
          }
        })
      ]);
    }

    revalidatePath('/admin');
    return { success: true };

  } catch (error) {
    console.error("Admin Action Failed:", error);
    return { success: false, error: "Failed to update status" };
  }
}