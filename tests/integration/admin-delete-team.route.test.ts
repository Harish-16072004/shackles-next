import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, findUniqueMock, deleteManyMock, deleteMock, transactionMock, revalidatePathMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  findUniqueMock: vi.fn(),
  deleteManyMock: vi.fn(),
  deleteMock: vi.fn(),
  transactionMock: vi.fn(async (cb) => {
    // Run the callback providing our mocked transaction client
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
  getSession: getSessionMock,
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

import { POST } from "@/app/api/admin/event-registrations/delete-team/route";

describe("integration: admin delete-team route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createFormData(data: Record<string, string>) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.append(key, value);
    }
    return formData;
  }

  it("rejects unauthenticated users", async () => {
    getSessionMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/admin/event-registrations/delete-team", { method: "POST" }));
    
    expect(response.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-123" });
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "user") return Promise.resolve({ id: "user-123", role: "USER" });
      return Promise.resolve(null);
    });

    const response = await POST(new Request("http://localhost/api/admin/event-registrations/delete-team", { method: "POST" }));
    
    expect(response.status).toBe(401);
  });

  it("redirects with missing-team error when teamId is omitted", async () => {
    getSessionMock.mockResolvedValue({ userId: "admin-123" });
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "user") return Promise.resolve({ id: "admin-123", role: "ADMIN" });
      return Promise.resolve(null);
    });

    const response = await POST(new Request("http://localhost/api/admin/event-registrations/delete-team", {
      method: "POST",
      body: createFormData({}),
    }));
    
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/error=missing-team$/);
  });

  it("redirects with team-not-found error when team does not exist", async () => {
    getSessionMock.mockResolvedValue({ userId: "admin-123" });
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "user") return Promise.resolve({ id: "admin-123", role: "ADMIN" });
      if (model === "team") return Promise.resolve(null);
      return Promise.resolve(null);
    });

    const response = await POST(new Request("http://localhost/api/admin/event-registrations/delete-team", {
      method: "POST",
      body: createFormData({ teamId: "invalid-team-id" }),
    }));
    
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/error=team-not-found$/);
  });

  it("deletes team and registrations transactionally and revalidates cache", async () => {
    getSessionMock.mockResolvedValue({ userId: "admin-123" });
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "user") return Promise.resolve({ id: "admin-123", role: "ADMIN" });
      if (model === "team") return Promise.resolve({ id: "valid-team-id" });
      return Promise.resolve(null);
    });

    const response = await POST(new Request("http://localhost/api/admin/event-registrations/delete-team", {
      method: "POST",
      body: createFormData({ teamId: "valid-team-id" }),
    }));
    
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toMatch(/success=team-deleted$/);

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { teamId: "valid-team-id" } });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "valid-team-id" } });
    
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/event-registrations");
  });

  it("rate limits repeated destructive attempts by the same admin user", async () => {
    getSessionMock.mockResolvedValue({ userId: "rate-admin-123" });
    findUniqueMock.mockImplementation((model: string) => {
      if (model === "user") return Promise.resolve({ id: "rate-admin-123", role: "ADMIN" });
      if (model === "team") return Promise.resolve({ id: "team-id" });
      return Promise.resolve(null);
    });

    const createReq = () => new Request("http://localhost/api/admin/event-registrations/delete-team", {
      method: "POST",
      body: createFormData({ teamId: "team-id" }),
    });

    // The limiter allows 10 requests per hour. We make 10 successful ones.
    for (let count = 0; count < 10; count++) {
      const res = await POST(createReq());
      expect(res.status).toBe(303);
    }

    // 11th request should be rate-limited
    const limitedRes = await POST(createReq());
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get("x-ratelimit-limit")).toBe("10");

    const json = await limitedRes.json();
    expect(json.error).toBe("Too many delete-team attempts. Please try again later.");
  });
});
