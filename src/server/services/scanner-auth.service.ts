import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const scannerRoles = new Set<Role>([Role.ADMIN, Role.COORDINATOR]);

export type ScannerAuthResult =
  | { ok: true; actor: { id: string; role: Role } }
  | { ok: false; reason: "NOT_AUTHENTICATED" | "NOT_AUTHORIZED"; message: string };

export async function authorizeScannerActor(): Promise<ScannerAuthResult> {
  const session = await getSession();
  if (!session?.userId) {
    return { ok: false, reason: "NOT_AUTHENTICATED", message: "Authentication required." };
  }

  const actor = await prisma.user.findUnique({
    where: { id: String(session.userId) },
    select: { id: true, role: true },
  });

  if (!actor || !scannerRoles.has(actor.role)) {
    return { ok: false, reason: "NOT_AUTHORIZED", message: "You are not allowed to perform this action." };
  }

  return { ok: true, actor };
}

export async function requireScannerActor() {
  return authorizeScannerActor();
}
