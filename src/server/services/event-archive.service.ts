import { Prisma, PrismaClient } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export async function archiveEventById(db: DbClient, eventId: string) {
  return db.event.update({
    where: { id: eventId },
    data: {
      isActive: false,
      isArchived: true,
    },
    select: {
      id: true,
      isActive: true,
      isArchived: true,
    },
  });
}

export async function restoreEventById(db: DbClient, eventId: string) {
  return db.event.update({
    where: { id: eventId },
    data: {
      isArchived: false,
      isActive: true,
    },
    select: {
      id: true,
      isActive: true,
      isArchived: true,
    },
  });
}
