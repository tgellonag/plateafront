import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL, RequestError, request } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("request", () => {
  it("HTTP-R1 reads fresh session state without a request body", async () => {
    const state = { session: { id: "room-1", status: "voting" } };
    const fetch = vi.fn(async () => Response.json(state));
    vi.stubGlobal("fetch", fetch);

    await expect(request("/api/v1/sessions/room-1", "room-token")).resolves.toEqual(state);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_URL}/api/v1/sessions/room-1`, {
      method: "GET",
      headers: { Authorization: "Bearer room-token" },
      body: undefined,
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it("HTTP-R1 sends an authenticated vote as JSON", async () => {
    const fetch = vi.fn(async () => Response.json({ type: "vote_saved" }));
    vi.stubGlobal("fetch", fetch);

    const path = "/api/v1/sessions/room-1/vote";
    await expect(
      request(path, "room-token", { round: 2, movie_id: 17, liked: false }),
    ).resolves.toEqual({ type: "vote_saved" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(API_URL + path, {
      method: "POST",
      headers: { Authorization: "Bearer room-token", "Content-Type": "application/json" },
      body: '{"round":2,"movie_id":17,"liked":false}',
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    [409, '{"error":"La sesión está cerrada"}', "La sesión está cerrada"],
    [500, "{}", "No se pudo completar la solicitud"],
    [
      503,
      "<html>Arrancando</html>",
      "El servidor no respondió. Puede estar iniciándose; reintenta.",
    ],
  ])(
    "HTTP-R2 preserves status %i and returns its message or a fallback",
    async (status, body, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(body, { status })),
      );

      const response = request("/api/v1/providers");
      await expect(response).rejects.toBeInstanceOf(RequestError);
      await expect(response).rejects.toMatchObject({ status, message });
    },
  );

  it("HTTP-R3 forwards cancellation to an in-flight request", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (_url: string, { signal }: RequestInit) =>
        new Promise<Response>((_, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    );
    vi.stubGlobal("fetch", fetch);

    const response = request("/api/v1/providers", undefined, undefined, controller.signal);
    controller.abort();

    await expect(response).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
