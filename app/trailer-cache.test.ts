import { afterEach, describe, expect, it, vi } from "vitest";
import { TrailerCache } from "./trailer-cache";

afterEach(() => vi.useRealTimers());

describe("TRAILER-R3 metadata prefetch", () => {
  it("shares in-flight and cached requests between prefetch and opening the card", async () => {
    const fetchTrailer = vi.fn(async (id: number) => ({
      key: id === 1 ? "aaaaaaaaaaa" : "bbbbbbbbbbb",
      language: "es-ES",
    }));
    const cache = new TrailerCache(fetchTrailer);
    const prefetch = cache.load(1);
    expect(cache.load(1)).toBe(prefetch);
    await prefetch;
    expect(cache.peek(1)).toEqual({ key: "aaaaaaaaaaa", language: "es-ES" });
    await cache.load(1);
    await cache.load(2);
    cache.retain([2, 3]);
    await cache.load(2);
    expect(fetchTrailer.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });

  it("retries failures but caches absence until the five-minute expiry", async () => {
    vi.useFakeTimers();
    const fetchTrailer = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const cache = new TrailerCache(fetchTrailer);
    await expect(cache.load(1)).rejects.toThrow("offline");
    expect(cache.peek(1)).toBeUndefined();
    await cache.load(1);
    expect(cache.peek(1)).toBeNull();
    await cache.load(1);
    expect(fetchTrailer).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(5 * 60_000);
    expect(cache.peek(1)).toBeUndefined();
    await cache.load(1);
    expect(fetchTrailer).toHaveBeenCalledTimes(3);
  });

  it("aborts obsolete prefetches and clears requests when leaving the voting screen", async () => {
    const signals = new Map<number, AbortSignal>();
    const cache = new TrailerCache((id, signal) => {
      signals.set(id, signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const first = cache.load(1).catch(() => null);
    const next = cache.load(2).catch(() => null);
    cache.retain([2, 3]);
    expect(signals.get(1)?.aborted).toBe(true);
    expect(signals.get(2)?.aborted).toBe(false);
    cache.clear();
    expect(signals.get(2)?.aborted).toBe(true);
    await Promise.all([first, next]);
    expect(cache.peek(2)).toBeUndefined();
  });

  it("never caches unsafe video keys", async () => {
    const cache = new TrailerCache(async () => ({ key: "../unsafe", language: "es-ES" }));
    await expect(cache.load(1)).rejects.toThrow("El tráiler recibido no es válido");
    expect(cache.peek(1)).toBeUndefined();
  });
});
