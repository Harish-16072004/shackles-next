import { Permission, Role } from "@prisma/client";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/permissions";

/**
 * Result of a safe action execution.
 */
export type ActionResponse<T> = 
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

/**
 * Metadata for a safe action.
 */
interface ActionMetadata {
  permission?: Permission;
  roles?: Role[];
}

/**
 * Safe Action Wrapper
 * Standardizes:
 * 1. Authentication Check
 * 2. Role/Permission Check
 * 3. Error Handling & Logging
 */
export async function executeSafeAction<T>(
  metadata: ActionMetadata,
  action: (session: NonNullable<Awaited<ReturnType<typeof getSession>>>) => Promise<T>
): Promise<ActionResponse<T>> {
  try {
    // 1. Authentication
    const session = await getSession();
    if (!session?.userId) {
      return { success: false, error: "Authentication required", code: "UNAUTHORIZED" };
    }

    const userRole = session.role as Role;

    // 2. Authorization (Role Check)
    if (metadata.roles && !metadata.roles.includes(userRole)) {
      return { success: false, error: "Insufficient role permissions", code: "FORBIDDEN" };
    }

    // 3. Authorization (Permission Check)
    if (metadata.permission && !hasPermission(userRole, metadata.permission)) {
      return { success: false, error: `Missing required permission: ${metadata.permission}`, code: "FORBIDDEN" };
    }

    // 4. Execution
    const data = await action(session);
    return { success: true, data };

  } catch (error: any) {
    console.error("Safe Action Error:", error);
    
    // Handle known error types or provide a generic error
    const errorMessage = error instanceof Error ? error.message : "An unexpected system error occurred";
    return { success: false, error: errorMessage, code: "INTERNAL_ERROR" };
  }
}
