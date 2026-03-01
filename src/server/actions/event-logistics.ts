'use server'

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// --- 1. SCAN LOGIC (For Volunteers) ---
// Input: Scanned QR Token string
// Output: Safe User Details + Event Status
export async function scanParticipantQR(token: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { qrToken: token },
      include: {
        registrations: {
          include: { event: true }
        }
      }
    });

    if (!user) {
      return { success: false, error: "Invalid QR Code" };
    }

    // Return ONLY what's needed for the volunteer
    return {
      success: true,
      data: {
        id: user.id,
        shacklesId: user.shacklesId,
        firstName: user.firstName, // Just first name to confirm identity
        role: user.role,
        kitStatus: user.kitStatus,
        registrationType: user.registrationType,
        events: user.registrations.map(r => ({
          eventName: r.event.name,
          attended: r.attended
        }))
      }
    };
  } catch (error) {
    console.error("Scan Error:", error);
    return { success: false, error: "System Error during Scan" };
  }
}

// --- 2. KIT DISTRIBUTION ---
export async function updateKitStatus(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { 
        kitStatus: 'ISSUED',
        kitIssuedAt: new Date()
      }
    });
    
    // Revalidate dashboard logic if needed
    revalidatePath('/admin'); 
    return { success: true, message: "Kit Issued Successfully" };
  } catch {
    return { success: false, error: "Failed to update kit status" };
  }
}

// --- 3. EVENT ATTENDANCE ---
export async function markEventAttendance(userId: string, eventName: string) {
  try {
    // 1. Find Event ID
    const event = await prisma.event.findUnique({
      where: { name: eventName }
    });

    if (!event) return { success: false, error: "Event not found" };

    // 2. Check Registration
    const registration = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: userId,
          eventId: event.id
        }
      }
    });

    // 3. Scenario: Not Registered -> "Prompt to Register"
    if (!registration) {
      return { 
        success: false, 
        code: "NOT_REGISTERED",
        error: `User is not registered for ${eventName}. Please register first.` 
      };
    }

    // 4. Scenario: Already Attended
    if (registration.attended) {
      return { success: true, message: "Already marked present." };
    }

    // 5. Scenario: Registered -> Mark Present
    await prisma.eventRegistration.update({
      where: { id: registration.id },
      data: {
        attended: true,
        attendedAt: new Date()
      }
    });

    return { success: true, message: `Marked present for ${eventName}` };

  } catch {
    return { success: false, error: "Attendance failed" };
  }
}

// --- 4. QUICK REGISTRATION (On-Spot) ---
export async function quickRegisterForEvent(userId: string, eventName: string) {
  try {
    const event = await prisma.event.findFirst({
      where: {
        name: { equals: eventName, mode: "insensitive" },
        isActive: true,
      },
    });
    if (!event) return { success: false, error: "Event not found" };

    const registeredCount = await prisma.eventRegistration.count({ where: { eventId: event.id } });
    if (event.maxParticipants != null && registeredCount >= event.maxParticipants) {
      return { success: false, error: "Event is full" };
    }

    // Create Registration
    await prisma.eventRegistration.create({
      data: {
        userId: userId,
        eventId: event.id,
        attended: true, // Auto-mark present since they are standing right there
        attendedAt: new Date()
      }
    });

    return { success: true, message: `Successfully registered & marked present for ${eventName}` };

  } catch {
    return { success: false, error: "Registration failed" };
  }
}

// --- 5. GET ALL EVENTS ---
export async function getAvailableEvents() {
  try {
    return await prisma.event.findMany({
      where: { isActive: true },
      select: { name: true, type: true, dayLabel: true, maxParticipants: true }
    });
  } catch {
    return [];
  }
}

export async function registerCurrentUserForEvent(eventName: string) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { success: false, error: "Please login to continue." };
    }

    const user = await prisma.user.findUnique({
      where: { id: String(session.userId) },
      include: { payment: true },
    });

    if (!user) {
      return { success: false, error: "User not found." };
    }

    if (user.payment?.status !== "VERIFIED") {
      return { success: false, error: "Only verified users can register for events." };
    }

    const event = await prisma.event.findFirst({
      where: {
        name: { equals: eventName, mode: "insensitive" },
        isActive: true,
      },
    });

    if (!event) {
      return { success: false, error: "Event is not available." };
    }

    const existing = await prisma.eventRegistration.findUnique({
      where: {
        userId_eventId: {
          userId: user.id,
          eventId: event.id,
        },
      },
    });

    if (existing) {
      return { success: true, message: "Already registered for this event." };
    }

    const currentCount = await prisma.eventRegistration.count({ where: { eventId: event.id } });
    if (event.maxParticipants != null && currentCount >= event.maxParticipants) {
      return { success: false, error: "This event is full." };
    }

    await prisma.eventRegistration.create({
      data: {
        userId: user.id,
        eventId: event.id,
      },
    });

    revalidatePath("/userDashboard");
    revalidatePath("/admin/events");
    revalidatePath("/admin/event-registrations");
    revalidatePath("/admin/adminDashboard");

    return { success: true, message: "Registered successfully." };
  } catch {
    return { success: false, error: "Registration failed" };
  }
}

