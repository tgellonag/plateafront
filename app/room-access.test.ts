import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL, RequestError } from "@/lib/api";
import { enterRoom, resumeAccess, savedRoomAccess, saveRoomAccess } from "./room-access";

const access = {
  session_id: "a0000000-0000-0000-0000-000000000001",
  token: "a".repeat(64),
};
const other = {
  session_id: "b0000000-0000-0000-0000-000000000002",
  token: "b".repeat(64),
};

function storage(entries: Record<string, string> = {}) {
  const values = { ...entries };
  vi.stubGlobal(
    "sessionStorage",
    Object.assign(values, {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
    }),
  );
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("room access", () => {
  it("INV-R6 stores the active access under the room and recent keys", () => {
    const saved = storage();
    saveRoomAccess(access);

    expect(JSON.parse(saved[`platea-${access.session_id}`])).toEqual(access);
    expect(JSON.parse(saved["platea-recent"])).toEqual(access);
    expect(saved["platea-last"]).toBe(access.session_id);
  });

  it("INV-R6 prioritizes the room in the URL over the last visited room", () => {
    storage({
      "platea-last": access.session_id,
      [`platea-${access.session_id}`]: JSON.stringify(access),
      [`platea-${other.session_id}`]: JSON.stringify(other),
    });

    expect(savedRoomAccess(`/room/${other.session_id}/manage`)).toEqual(other);
    expect(savedRoomAccess("/")).toEqual(access);
    expect(savedRoomAccess("/room/unknown")).toBeNull();
  });

  it("INV-R6 resumes through the server using the saved access token", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetch);

    await expect(resumeAccess(access)).resolves.toEqual(access);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${API_URL}/api/v1/sessions/${access.session_id}/resume`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${access.token}`,
        }),
      }),
    );
  });

  it("INV-R6 propagates the server's refusal to resume an expired access", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Acceso vencido" }, { status: 401 })),
    );

    const result = resumeAccess(access);
    await expect(result).rejects.toBeInstanceOf(RequestError);
    await expect(result).rejects.toMatchObject({ status: 401, message: "Acceso vencido" });
  });

  it("INV-R7 ignores malformed storage entries and sends a duplicated access token only once", async () => {
    storage({
      [`platea-${access.session_id}`]: JSON.stringify(access),
      [`platea-${other.session_id}`]: JSON.stringify(other),
      "platea-c0000000-0000-0000-0000-000000000003": "{",
      "platea-d0000000-0000-0000-0000-000000000004": '{"token":"short"}',
      "platea-votes-for-a-room": JSON.stringify({ token: "c".repeat(64) }),
    });
    const fetch = vi.fn(async () => Response.json(access));
    vi.stubGlobal("fetch", fetch);

    await expect(
      enterRoom(false, { name: "Ana", code: "ABC234", isTest: false }, access),
    ).resolves.toEqual(access);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${API_URL}/api/v1/join`,
      expect.objectContaining({
        body: JSON.stringify({ name: "Ana", code: "ABC234", tokens: [access.token, other.token] }),
      }),
    );
  });

  it("INV-R7 carries at most the last 64 unique stored tokens when joining", async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [
        `platea-00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        JSON.stringify({ token: String(i).padStart(64, "0") }),
      ]),
    );
    storage(entries);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(access));
    vi.stubGlobal("fetch", fetch);

    await enterRoom(false, { name: "Ana", code: "ABC234", isTest: false }, null);
    const { tokens } = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(tokens).toHaveLength(64);
    expect(tokens[0]).toMatch(/0{63}1/);
    expect(tokens[63]).toMatch(/0{62}64/);
  });

  it("INV-R7 creates a demonstration room without including a join code or stored tokens", async () => {
    const fetch = vi.fn(async () => Response.json(access));
    vi.stubGlobal("fetch", fetch);

    await enterRoom(true, { name: "Ana", code: "ABC234", isTest: true }, access);

    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${API_URL}/api/v1/sessions`,
      expect.objectContaining({
        body: '{"name":"Ana","is_test":true}',
      }),
    );
  });
});
