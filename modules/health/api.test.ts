import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { getHealth } from "./api";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
}

describe("getHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the body when the backend is healthy", async () => {
    mockFetch(200, { status: "ok", db: "ok" });
    await expect(getHealth()).resolves.toEqual({ status: "ok", db: "ok" });
  });

  it("returns the body on 503 (db down)", async () => {
    mockFetch(503, { status: "error", db: "down" });
    await expect(getHealth()).resolves.toEqual({ status: "error", db: "down" });
  });

  it("throws ApiError on other errors", async () => {
    mockFetch(500, null);
    await expect(getHealth()).rejects.toBeInstanceOf(ApiError);
  });
});
