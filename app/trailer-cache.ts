export type Trailer = { key: string; language: string };
type Entry = {
  controller: AbortController;
  promise: Promise<Trailer | null>;
  value?: Trailer | null;
  expiresAt?: number;
};

// Scoped to one voting session/access; never persists participant credentials or videos.
export class TrailerCache {
  private entries = new Map<number, Entry>();

  constructor(
    private fetchTrailer: (movieID: number, signal: AbortSignal) => Promise<Trailer | null>,
  ) {}

  peek(movieID: number): Trailer | null | undefined {
    const entry = this.entries.get(movieID);
    return entry?.expiresAt && entry.expiresAt > Date.now() ? entry.value : undefined;
  }

  load(movieID: number): Promise<Trailer | null> {
    const previous = this.entries.get(movieID);
    if (previous && (!previous.expiresAt || previous.expiresAt > Date.now()))
      return previous.promise;

    const controller = new AbortController();
    const entry: Entry = {
      controller,
      promise: Promise.resolve(null),
    };
    entry.promise = this.fetchTrailer(movieID, controller.signal)
      .then((video) => {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (video && !/^[A-Za-z0-9_-]{11}$/.test(video.key))
          throw new Error("El tráiler recibido no es válido");
        entry.value = video;
        entry.expiresAt = Date.now() + 5 * 60_000;
        return video;
      })
      .catch((error: unknown) => {
        if (this.entries.get(movieID) === entry) this.entries.delete(movieID);
        throw error;
      });
    this.entries.delete(movieID);
    this.entries.set(movieID, entry);
    return entry.promise;
  }

  retain(movieIDs: number[]) {
    for (const [id, entry] of this.entries) {
      if (!movieIDs.includes(id) && (!entry.expiresAt || entry.expiresAt <= Date.now())) {
        entry.controller.abort();
        this.entries.delete(id);
      }
    }
    // Keep only a small recent history when users return to the voting screen.
    for (const [id, entry] of this.entries) {
      if (this.entries.size <= 8) break;
      if (entry.expiresAt && !movieIDs.includes(id)) this.entries.delete(id);
    }
  }

  clear() {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }
}
