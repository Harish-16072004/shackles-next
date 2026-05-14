import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkCanManageRegistrationsMock, findUniqueMock, deleteManyMock, deleteMock, transactionMock, revalidatePathMock } = vi.hoisted(() => ({
  checkCanManageRegistrationsMock: vi.fn(),
  findUniqueMock: vi.fn(),
  deleteManyMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(async (cb) => {
    return cb({
      eventRegistration: { deleteMany: deleteManyMock },
      team: { delete: deleteMock },
    });
  }),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
  checkCanManageRegistrations: checkCanManageRegistrationsMock,
  checkEventStaff: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  createRateLimiter: () => ({
    limit: vi.fn().mockResolvedValue({ success: true, remaining: 9, reset: Date.now() + 60000 }),
  }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (args: any) => findUniqueMock("user", args),
    },
    team: {
      findUnique: (args: any) => findUniqueMock("team", args),
    },
    $transaction: transactionMock,
  },
}));

// Mock all other dependencies that event-logistics.ts imports
vi.mock("@/lib/edition", () => ({ getActiveYear: () => 2026 }));
vi.mock("@/lib/env", () => ({ isScannerBulkTeamFlowEnabled: () => false }));
vi.mock("@/lib/admin-audit", () => ({ logAdminAudit: vi.fn() }));
vi.mock("@/lib/safe-action", () => ({ executeSafeAction: vi.fn() }));
vi.mock("@/server/services/team-registration.service", () => ({
  addMemberToTeamEvent: vi.fn(),
  bulkRegisterTeamByShacklesIds: vi.fn(),
  completeExistingTeamRegistration: vi.fn(),
  normalizeShacklesId: vi.fn((id: string) => id.toUpperCase()),
  normalizeTeamName: vi.fn((name: string) => name.toUpperCase()),
  generateUniqueTeamCode: vi.fn().mockResolvedValue("ABCD12"),
  parseUniqueShacklesIds: vi.fn(),
}));
vi.mock("@/server/services/transaction.service", () => ({
  runSerializableTransaction: vi.fn(),
}));
vi.mock("@/server/services/qr.service", () => ({
  decodeQrPayload: vi.fn(),
}));
vi.mock("@/server/services/qr-management.service", () => ({
  processQRScan: vi.fn(),
}));

import { deleteTeam } from "@/server/actions/event-logistics";

describe("integration: admin delete-team (server action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkCanManageRegistrationsMock.mockResolvedValue({ allowed: true, session: { userId: "admin-123" } });
  });

  it("rejects unauthenticated users", async () => {
    checkCanManageRegistrationsMock.mockResolvedValue({ allowed: false, session: null });

    const result = await deleteTeam({ teamId: "team-id", eventId: "event-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized.");
  });

  it("rejects non-admin users", async () => {
    checkCanManageRegistrationsMock.mockResolvedValue({ allowed: false, session: { userId: "user-123" } });

    const result = await deleteTeam({ teamId: "team-id", eventId: "event-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized.");
  });

  it("returns error when teamId is missing", async () => {
    const result = await deleteTeam({ teamId: "", eventId: "event-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Team ID is required.");
  });

  it("returns error when team does not exist", async () => {
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "team") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const result = await deleteTeam({ teamId: "invalid-team-id", eventId: "event-id" });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Team not found.");
  });

  it("deletes team and registrations transactionally and revalidates cache", async () => {
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "team") return Promise.resolve({ id: "valid-team-id" });
      return Promise.resolve(null);
    });

    const result = await deleteTeam({ teamId: "valid-team-id", eventId: "event-id" });

    expect(result.success).toBe(true);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { teamId: "valid-team-id" } });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "valid-team-id" } });

    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/event-registrations", "layout");
  });
});
