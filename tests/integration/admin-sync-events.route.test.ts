import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock, findManyMock, getLocalEmbeddingMock, getPineconeIndexMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  findManyMock: vi.fn(),
  getLocalEmbeddingMock: vi.fn(),
  getPineconeIndexMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/embeddings", () => ({
  getLocalEmbedding: getLocalEmbeddingMock,
}));

vi.mock("@/lib/pinecone", () => ({
  getPineconeIndex: getPineconeIndexMock,
}));

import { POST } from "@/app/api/admin/sync-events/route";

describe("integration: admin sync-events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = "dev-secret";
    findManyMock.mockResolvedValue([
      {
        id: "event-1",
        name: "Hackathon",
        description: "Build something great",
        type: "TECHNICAL",
      },
    ]);
    getLocalEmbeddingMock.mockResolvedValue([0.1, 0.2, 0.3]);
    getPineconeIndexMock.mockReturnValue({
      upsert: upsertMock,
    });
    upsertMock.mockResolvedValue(undefined);
  });

  it("syncs events and rate limits repeated requests from the same client", async () => {
    const request = () =>
      new Request("http://localhost/api/admin/sync-events", {
        method: "POST",
        headers: {
          Authorization: "Bearer dev-secret",
          "x-forwarded-for": "198.51.100.7",
        },
      });

    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      success: true,
      syncedCount: 1,
    });

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await POST(request());
      expect(response.status).toBe(200);
    }

    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("x-ratelimit-limit")).toBe("5");
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(await limited.json()).toMatchObject({
      error: "Too many sync requests. Please try again later.",
    });
    expect(upsertMock).toHaveBeenCalled();
    expect(getLocalEmbeddingMock).toHaveBeenCalledTimes(5);
  });
});
