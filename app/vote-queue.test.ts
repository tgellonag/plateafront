import { describe, expect, it, vi } from "vitest";
import { VoteQueue, type Vote } from "./vote-queue";

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
  it("sends a vote and confirms it from the server receipt", async () => {
    const send = vi.fn(saved);
    const queue = new VoteQueue(room(), memoryStorage, send, async () => {});

    expect(queue.enqueue(10, true)).toBe(true);
    expect(queue.hasVoted(10)).toBe(true);
    await vi.waitFor(() => expect(queue.hasPending).toBe(false));

    expect(send).toHaveBeenCalledOnce();
    expect(queue.enqueue(10, false)).toBe(false);
    expect(queue.errors).toEqual([]);
  });

  it("keeps an unsent vote across a reload and sends it again", async () => {
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

  it("does not report a loss when a failed request was saved after all", async () => {
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
});
