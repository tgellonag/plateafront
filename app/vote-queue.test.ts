import { describe, expect, it, vi } from "vitest";
import { VoteQueue, shouldRefreshRoom, type Vote } from "./vote-queue";

const room = (votes: { participant_id: string; movie_id: number; liked: boolean }[] = []) => ({
  session: { id: "s1", round: 1, status: "voting" },
  me: { id: "p1" },
  movies: [
    { id: 10, round: 1, title: "A" },
    { id: 11, round: 1, title: "B" },
  ],
  votes,
});
const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};
const saved = (vote: Vote) => Promise.resolve({ ...vote, type: "vote_saved" as const });

describe("VoteQueue", () => {
  it("VOTE-R3 restores a large queue across batches and votes using each movie's original round", async () => {
    const storage = memoryStorage();
    const movies = Array.from({ length: 45 }, (_, id) => ({
      id,
      round: Math.floor(id / 15) + 1,
      title: String(id),
    }));
    storage.setItem(
      "platea-votes-s1-p1",
      JSON.stringify(
        movies.slice(0, 44).map((movie) => ({
          round: movie.round,
          participant_id: "p1",
          movie_id: movie.id,
          liked: true,
        })),
      ),
    );
    const send = vi.fn(saved);
    const state = { ...room(), session: { ...room().session, round: 4 }, movies };
    const queue = new VoteQueue(
      state,
      () => storage,
      send,
      async () => {},
    );
    expect(queue.enqueue(44, false)).toBe(true);
    queue.reconcile({ ...state, session: { ...state.session, round: 5 } });
    await vi.waitFor(() => expect(queue.hasPending).toBe(false));
    expect(send).toHaveBeenCalledTimes(45);
    expect(send.mock.calls[0][0].round).toBe(1);
    expect(send.mock.calls[44][0].round).toBe(3);
    expect(queue.errors).toEqual([]);
  });

  it("VOTE-R4 sends a vote and confirms it from the server receipt", async () => {
    const send = vi.fn(saved);
    const queue = new VoteQueue(room(), memoryStorage, send, async () => {});

    expect(queue.enqueue(10, true)).toBe(true);
    expect(queue.hasVoted(10)).toBe(true);
    await vi.waitFor(() => expect(queue.hasPending).toBe(false));

    expect(send).toHaveBeenCalledOnce();
    expect(queue.enqueue(10, false)).toBe(false);
    expect(queue.errors).toEqual([]);
  });

  it("VOTE-R3 keeps an unsent vote across a reload and sends it again", async () => {
    const storage = memoryStorage();
    const first = new VoteQueue(
      room(),
      () => storage,
      () => new Promise(() => {}),
      async () => {},
    );
    first.enqueue(11, false);
    first.dispose();

    const send = vi.fn(saved);
    const reloaded = new VoteQueue(
      room(),
      () => storage,
      send,
      async () => {},
    );
    await vi.waitFor(() => expect(reloaded.hasPending).toBe(false));

    expect(send).toHaveBeenCalledWith(
      { round: 1, participant_id: "p1", movie_id: 11, liked: false },
      expect.any(AbortSignal),
    );
  });

  it("VOTE-R4 does not report a loss when a failed request was saved after all", async () => {
    const send = vi.fn(() =>
      Promise.reject(Object.assign(new Error("Rechazado"), { status: 400 })),
    );
    // The server answered with an error, but the next room snapshot shows the vote was stored.
    const refresh = vi.fn(async () =>
      queue.reconcile(room([{ participant_id: "p1", movie_id: 10, liked: true }])),
    );
    const queue = new VoteQueue(room(), memoryStorage, send, refresh);

    queue.enqueue(10, true);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());

    expect(queue.hasPending).toBe(false);
    expect(queue.errors).toEqual([]);
  });

  it("VOTE-R5 keeps the server's opposite vote from a receipt and warns", async () => {
    const send = vi.fn((vote: Vote) => saved({ ...vote, liked: !vote.liked }));
    const queue = new VoteQueue(room(), memoryStorage, send, async () => {});

    queue.enqueue(10, true);
    await vi.waitFor(() => expect(queue.hasPending).toBe(false));

    expect(queue.confirmed.get(10)?.liked).toBe(false);
    expect(queue.errors).toEqual([
      "No se guardó tu voto por “A” (ronda 1). El servidor ya tenía el voto contrario; se conserva ese voto.",
    ]);
  });

  it("VOTE-R5 keeps the server's opposite vote from a room snapshot and warns", () => {
    const queue = new VoteQueue(
      room(),
      memoryStorage,
      () => new Promise(() => {}),
      async () => {},
    );
    queue.enqueue(11, true);

    queue.reconcile(room([{ participant_id: "p1", movie_id: 11, liked: false }]));

    expect(queue.hasPending).toBe(false);
    expect(queue.confirmed.get(11)?.liked).toBe(false);
    expect(queue.errors).toHaveLength(1);
  });
});

describe("shouldRefreshRoom", () => {
  it.each([
    ["a vote outside the ranking", '{"type":"vote_changed"}', false, false],
    ["a vote while viewing the ranking", '{"type":"vote_changed"}', true, true],
    ["a structural change", '{"type":"changed"}', false, true],
    ["a revoked access notice", '{"type":"revoked"}', false, true],
    ["an unreadable message", "not json", false, true],
  ])("RT-R2 %s", (_, message, management, refresh) => {
    expect(shouldRefreshRoom(message, management)).toBe(refresh);
  });
});
