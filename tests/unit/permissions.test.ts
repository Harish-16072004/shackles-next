import { describe, expect, it } from 'vitest';
import { Role, Permission } from '@prisma/client';
import { hasPermission, getPermissionsByRole } from '../../src/lib/permissions';

describe('Permissions Utility', () => {
  describe('hasPermission', () => {
    it('returns true if role has permission', () => {
      expect(hasPermission(Role.ADMIN, Permission.MANAGE_SCORES)).toBe(true);
      expect(hasPermission(Role.COORDINATOR, Permission.SCAN_ATTENDANCE)).toBe(true);
      expect(hasPermission(Role.VOLUNTEER, Permission.SCAN_KIT)).toBe(true);
    });

    it('returns false if role does not have permission', () => {
      expect(hasPermission(Role.VOLUNTEER, Permission.MANAGE_SCORES)).toBe(false);
      expect(hasPermission(Role.PARTICIPANT, Permission.SCAN_ATTENDANCE)).toBe(false);
      expect(hasPermission(Role.APPLICANT, Permission.ONSPOT_INDIVIDUAL_REG)).toBe(false);
    });
  });

  describe('getPermissionsByRole', () => {
    it('returns correct permissions for ADMIN', () => {
      const perms = getPermissionsByRole(Role.ADMIN);
      expect(perms).toContain(Permission.MANAGE_TEAMS);
      expect(perms).toContain(Permission.MANAGE_SCORES);
      expect(perms.length).toBe(6);
    });

    it('returns empty array for PARTICIPANT', () => {
      const perms = getPermissionsByRole(Role.PARTICIPANT);
      expect(perms).toEqual([]);
    });
  });
});
