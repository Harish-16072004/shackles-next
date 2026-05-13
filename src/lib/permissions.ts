import { Role, Permission } from "@prisma/client";

/**
 * Mapping of Roles to their assigned Permissions.
 * This centralizes the authorization logic, making it easier to audit and update.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    Permission.SCAN_ATTENDANCE,
    Permission.SCAN_KIT,
    Permission.ONSPOT_INDIVIDUAL_REG,
    Permission.ONSPOT_TEAM_REG,
    Permission.MANAGE_TEAMS,
    Permission.MANAGE_SCORES,
  ],
  [Role.COORDINATOR]: [
    Permission.SCAN_ATTENDANCE,
    Permission.SCAN_KIT,
    Permission.ONSPOT_INDIVIDUAL_REG,
    Permission.ONSPOT_TEAM_REG,
    Permission.MANAGE_TEAMS,
    Permission.MANAGE_SCORES,
  ],
  [Role.VOLUNTEER]: [
    Permission.SCAN_ATTENDANCE,
    Permission.SCAN_KIT,
    Permission.ONSPOT_INDIVIDUAL_REG,
    Permission.ONSPOT_TEAM_REG,
  ],
  [Role.PARTICIPANT]: [],
  [Role.APPLICANT]: [],
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsByRole(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}
