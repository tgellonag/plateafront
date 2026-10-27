import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VoteQueue, shouldRefreshRoom, type Vote, type VoteReceipt } from "./vote-queue";

const room = () => ({
  session: { id: "session", round: 1, status: "voting" },
  me: { id: "me", is_host: true },
  movies: [1, 2, 3].map((id) => ({ id, round: 1, title: `Movie ${id}` })),
  votes: [] as Vote[],
});
const receipt = (vote: Vote): VoteReceipt => ({ ...vote, type: "vote_saved" });
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("advances during slow saving, guards double-clicks, queues sequentially and saves silently", async () => {
  const delayed = deferred<VoteReceipt>();
  const send = vi
    .fn<(v: Vote) => Promise<VoteReceipt>>()
    .mockImplementationOnce(() => delayed.promise)
    .mockImplementation(async (v) => receipt(v));
  const refresh = vi.fn(async () => {});
  const queue = new VoteQueue(room(), storage, send, refresh);
  expect(queue.enqueue(1, true)).toBe(true);
  expect(queue.enqueue(1, false)).toBe(false);
  expect(queue.enqueue(2, false)).toBe(true);
  expect(queue.hasVoted(1)).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
  expect(queue.errors).toEqual([]);
  delayed.resolve(receipt(queue.pending[0]));
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(2);
  expect(queue.hasPending).toBe(false);
  expect(queue.errors).toEqual([]);
  expect(refresh).not.toHaveBeenCalled();
});

it("preserves pending work through snapshots, view changes, reloads and late HTTP receipts", async () => {
  const saved = storage();
  const delayed = deferred<VoteReceipt>();
  const queue = new VoteQueue(
    room(),
    () => saved,
    () => delayed.promise,
    async () => {},
  );
  queue.enqueue(1, false);
  queue.reconcile(room()); // Opening Session / returning focus with an older snapshot.
  expect(queue.pending).toHaveLength(1);
  queue.dispose(); // Reload; the aborted request might already have committed.
  const retried = deferred<VoteReceipt>();
  const restored = new VoteQueue(
    room(),
    () => saved,
    () => retried.promise,
    async () => {},
  );
  expect(restored.hasVoted(1)).toBe(true);
  retried.resolve(receipt(restored.pending[0]));
  await vi.runAllTimersAsync();
  restored.reconcile(room()); // This GET began before the HTTP acknowledgement.
  expect(restored.hasVoted(1)).toBe(true);
  expect(restored.hasPending).toBe(false);
  expect(restored.errors).toEqual([]);
  delayed.resolve(receipt({ participant_id: "me", round: 1, movie_id: 1, liked: false }));
  await vi.runAllTimersAsync();
  queue.retry(); // A stale retry callback from the previous view must not overwrite the new queue.
  expect(JSON.parse(saved.getItem("platea-votes-session-me")!)).toEqual([]);
});

it("retries lost acknowledgements idempotently without GETs or visible save messages", async () => {
  const send = vi
    .fn<(v: Vote) => Promise<VoteReceipt>>()
    .mockRejectedValueOnce(new Error("Timeout"))
    .mockImplementation(async (v) => receipt(v));
  const refresh = vi.fn(async () => {});
  const queue = new VoteQueue(room(), storage, send, refresh);
  queue.enqueue(1, true);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  expect(queue.hasPending).toBe(false);
  expect(queue.errors).toEqual([]);
  expect(refresh).not.toHaveBeenCalled();
});

it("reconciles an ambiguous commit before reporting exhausted retries", async () => {
  const send = vi.fn(async (): Promise<VoteReceipt> => {
    throw new Error("Timeout");
  });
  const refresh = vi.fn(async () => {
    const next = room();
    next.votes = [{ ...queue.pending[0] }];
    queue.reconcile(next);
  });
  const queue = new VoteQueue(room(), storage, send, refresh);
  queue.enqueue(1, true);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(3);
  expect(refresh).toHaveBeenCalledOnce();
  expect(queue.errors).toEqual([]);
  expect(queue.hasPending).toBe(false);
});

it("identifies unrecoverable votes, stops retries, and offers explicit retry or discard", async () => {
  const send = vi
    .fn<(v: Vote) => Promise<VoteReceipt>>()
    .mockRejectedValue(new Error("Servidor caído"));
  const queue = new VoteQueue(room(), storage, send, async () => {});
  queue.enqueue(1, true);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(3);
  expect(queue.errors.join()).toContain("Movie 1");
  expect(queue.hasPending).toBe(true);
  queue.reconcile(room());
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(3);
  send.mockImplementation(async (v) => receipt(v));
  queue.retry();
  await vi.runAllTimersAsync();
  expect(queue.errors).toEqual([]);
  expect(queue.hasPending).toBe(false);
  send.mockRejectedValue(Object.assign(new Error("Candidata inválida"), { status: 400 }));
  queue.enqueue(2, false);
  await vi.runAllTimersAsync();
  expect(send).toHaveBeenCalledTimes(5);
  queue.discardFailed();
  expect(queue.hasVoted(2)).toBe(false);
});

it.each(["close", "next", "kick", "host"])(
  "handles %s racing with an in-flight vote",
  async (change) => {
    const delayed = deferred<VoteReceipt>();
    const queue = new VoteQueue(
      room(),
      storage,
      (v) => (v.movie_id === 1 ? delayed.promise : Promise.resolve(receipt(v))),
      async () => {},
    );
    queue.enqueue(1, true);
    queue.enqueue(2, false);
    const vote = { ...queue.pending[0] };
    const next = room();
    if (change === "close") next.session.status = "closed";
    if (change === "next") next.session.round = 2;
    if (change === "kick") queue.revoke();
    if (change === "host") next.me.is_host = false;
    queue.reconcile(next);
    expect(queue.hasPending).toBe(true);
    expect(queue.errors.length).toBe(change === "host" ? 0 : 2);
    delayed.resolve(receipt(vote));
    await vi.runAllTimersAsync();
    expect(queue.confirmed.get(1)?.liked).toBe(true);
    if (change !== "host") {
      expect(queue.pending).toHaveLength(1);
      queue.retry();
      await vi.runAllTimersAsync();
      expect(queue.pending[0].error).toBeTruthy();
      queue.discardFailed();
      expect(queue.hasPending).toBe(false);
    } else {
      expect(queue.errors).toEqual([]);
      expect(queue.hasPending).toBe(false);
      queue.dispose();
    }
  },
);

it("never silently agrees with an opposite canonical vote", async () => {
  const queue = new VoteQueue(
    room(),
    storage,
    async (v) => receipt({ ...v, liked: !v.liked }),
    async () => {},
  );
  queue.enqueue(1, true);
  await vi.runAllTimersAsync();
  expect(queue.confirmed.get(1)?.liked).toBe(false);
  expect(queue.errors.join()).toContain("voto contrario");
  expect(queue.hasPending).toBe(false);
});

it("accepts duplicate snapshots/notifications but rejects wrong-scope receipts", async () => {
  const send = vi.fn(async (v: Vote) => receipt({ ...v, round: 2 }));
  const queue = new VoteQueue(room(), storage, send, async () => {});
  queue.enqueue(1, true);
  queue.reconcile({ ...room(), me: { id: "someone else" } });
  await vi.runAllTimersAsync();
  expect(queue.errors.join()).toContain("Confirmación de voto inválida");
  const next = room();
  next.votes = [{ ...queue.pending[0] }];
  queue.reconcile(next);
  queue.reconcile(next);
  expect(queue.hasPending).toBe(false);
  expect(queue.errors).toEqual([]);
  expect(queue.confirmed.size).toBe(1);
  expect(shouldRefreshRoom('{"type":"vote_changed"}', false)).toBe(false);
  expect(shouldRefreshRoom('{"type":"vote_changed"}', true)).toBe(true);
  expect(shouldRefreshRoom('{"type":"changed"}', false)).toBe(true);
  expect(shouldRefreshRoom("invalid", false)).toBe(true);
});

it("surfaces storage failure and never overwrites votes it could not read", async () => {
  const saved = storage();
  const setItem = vi.spyOn(saved, "setItem");
  const getItem = vi.spyOn(saved, "getItem").mockImplementation(() => {
    throw new Error("Denied");
  });
  const delayed = deferred<VoteReceipt>();
  const queue = new VoteQueue(
    room(),
    () => saved,
    () => delayed.promise,
    async () => {},
  );
  queue.enqueue(1, true);
  expect(queue.errors.join()).toContain("recuperar");
  expect(setItem).not.toHaveBeenCalled();
  getItem.mockReturnValue("[]");
  queue.retry();
  expect(setItem).toHaveBeenCalled();
  expect(queue.errors).toEqual([]);
  setItem.mockImplementation(() => {
    throw new Error("Quota");
  });
  queue.enqueue(2, false);
  expect(queue.errors.join()).toContain("conservar");
  queue.dispose();
});
