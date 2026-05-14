import { beforeEach, describe, expect, it, vi } from "vitest";

const { mkdirMock, writeFileMock, uploadToSpacesMock, createSpacesSignedGetUrlMock } = vi.hoisted(() => ({
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  uploadToSpacesMock: vi.fn(),
  createSpacesSignedGetUrlMock: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: () => "uuid-1234",
}));

vi.mock("fs", () => ({
  promises: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
  },
}));

vi.mock("@/lib/storage-provider", () => ({
  getStorageProvider: () => "local",
  shouldUseLocal: () => true,
  shouldUseDigitalOcean: () => false,
}));

vi.mock("@/lib/digitalocean/spaces", () => ({
  uploadToSpaces: uploadToSpacesMock,
  createSpacesSignedGetUrl: createSpacesSignedGetUrlMock,
}));

vi.mock("@/lib/safe-log", () => ({
  safeLogError: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "test-user" } })),
}));

// Mock next/server since it's not fully compatible with vitest node environment
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((body, init) => {
      const res = new Response(JSON.stringify(body), init);
      // Add json method to mock Response behavior in tests
      (res as any).json = async () => body;
      return res;
    }),
  },
}));

import { POST } from "@/app/api/upload/payment-proof/route";

describe("integration: payment-proof upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
  });

  it("stores a local image upload and then rate limits repeated requests from the same client", async () => {
    const makeRequest = () => {
      const formData = new FormData();
      formData.append("file", new File([new Uint8Array([1, 2, 3])], "proof.png", { type: "image/png" }));

      const req = new Request("http://localhost/api/upload/payment-proof", {
        method: "POST",
        body: formData,
        headers: {
          "x-forwarded-for": "203.0.113.25",
        },
      });
      // Mock formData for Node Request if necessary (Vitest usually handles this but just in case)
      (req as any).formData = async () => formData;
      return req;
    };

    const first = await POST(makeRequest());
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { proofPath: string; proofUrl: string };
    
    // Path: payment-proofs/YYYY/MM/uuid-1234.png
    expect(firstBody.proofPath).toMatch(/^payment-proofs\/\d{4}\/\d{2}\/uuid-1234\.png$/);
    // URL: http://localhost:3000/api/files/payment-proof/payment-proofs/YYYY/MM/uuid-1234.png
    expect(firstBody.proofUrl).toContain("/api/files/payment-proof/payment-proofs/");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await POST(makeRequest());
      expect(response.status).toBe(200);
    }

    const rateLimited = await POST(makeRequest());
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("x-ratelimit-limit")).toBe("5");
    expect(rateLimited.headers.get("retry-after")).toBeTruthy();
    expect(await rateLimited.json()).toMatchObject({
      error: "Too many upload attempts. Please try again later.",
    });

    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalled();
    expect(uploadToSpacesMock).not.toHaveBeenCalled();
    expect(createSpacesSignedGetUrlMock).not.toHaveBeenCalled();
  }, 30000);
});
