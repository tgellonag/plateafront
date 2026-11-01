export type Vote = {
  round: number;
  participant_id: string;
  movie_id: number;
  liked: boolean;
};
export type VoteReceipt = Vote & { type: "vote_saved" };
type PendingVote = Vote & { error?: string };
type VotingRoom = {
  session: { id: string; round: number; status: string };
  me: { id: string };
  movies: { id: number; round: number; title: string }[];
  votes: { participant_id: string; movie_id: number; liked: boolean }[];
};

export function shouldRefreshRoom(message: string, management: boolean) {
  try {
    return JSON.parse(message).type !== "vote_changed" || management;
  } catch {
    return true;
  }
}

// A cumulative session queue. Only own votes are overlaid on the deck.
export class VoteQueue {
  pending: PendingVote[] = [];
  confirmed = new Map<number, Vote>();
  storageError = "";
  conflict = "";
  private room: VotingRoom;
  private key: string;
  private running = false;
  private stopped = false;
  private revoked = false;
  private controller = new AbortController();
  private listeners = new Set<() => void>();
  private revision = 0;
  private storageLoaded = false;

  constructor(
    room: VotingRoom,
    private storage: () => Pick<Storage, "getItem" | "setItem">,
    private send: (vote: Vote, signal: AbortSignal) => Promise<VoteReceipt>,
    private refresh: () => Promise<void>,
  ) {
    this.room = room;
    this.key = `platea-votes-${room.session.id}-${room.me.id}`;
    this.restore();
    this.reconcile(room);
  }

  private restore() {
    try {
      const saved: unknown = JSON.parse(this.storage().getItem(this.key) ?? "[]");
      if (
        !Array.isArray(saved) ||
        saved.some(
          (v) =>
            !v ||
            v.participant_id !== this.room.me.id ||
            !Number.isInteger(v.movie_id) ||
            !Number.isSafeInteger(v.round) ||
            v.round < 1 ||
            typeof v.liked !== "boolean" ||
            (v.error !== undefined && typeof v.error !== "string"),
        )
      )
        throw new Error("Invalid saved votes");
      for (const vote of saved as PendingVote[]) {
        if (!this.hasVoted(vote.movie_id)) this.pending.push(vote);
      }
      this.storageLoaded = true;
    } catch {
      this.storageError = "No se pudieron recuperar los votos locales. No recargues esta pestaña.";
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.revision;
  private changed() {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  }
  private persist() {
    if (!this.storageLoaded) {
      this.changed();
      return; // Do not overwrite votes that could not be read.
    }
    try {
      this.storage().setItem(this.key, JSON.stringify(this.pending));
      this.storageError = "";
    } catch {
      this.storageError =
        "El navegador no permite conservar tus votos pendientes. No recargues ni cierres esta pestaña; reintenta.";
    }
    this.changed();
  }
  get hasPending() {
    return this.pending.length > 0;
  }
  get errors() {
    return [this.storageError, this.conflict, ...this.pending.map((v) => v.error)].filter(Boolean);
  }
  hasVoted(movieID: number) {
    return this.confirmed.has(movieID) || this.pending.some((v) => v.movie_id === movieID);
  }
  private eligible(vote: Vote) {
    return (
      !this.revoked &&
      this.room.session.status === "voting" &&
      this.room.movies.some((m) => m.id === vote.movie_id && m.round === vote.round)
    );
  }
  private unsaved(vote: Vote, reason: string) {
    const title = this.room.movies.find((m) => m.id === vote.movie_id)?.title ?? vote.movie_id;
    return `No se guardó tu voto por “${title}” (ronda ${vote.round}). ${reason}`;
  }
  enqueue(movieID: number, liked: boolean) {
    if (this.stopped || this.hasVoted(movieID)) return false;
    const vote: Vote = {
      round: this.room.movies.find((m) => m.id === movieID)?.round ?? 0,
      participant_id: this.room.me.id,
      movie_id: movieID,
      liked,
    };
    if (!this.eligible(vote)) return false;
    this.pending.push(vote);
    this.persist(); // Durability is attempted before advancing the deck or starting HTTP.
    void this.flush();
    return true;
  }
  private acknowledge(vote: Vote, canonical: Vote) {
    if (canonical.liked !== vote.liked)
      this.conflict = this.unsaved(
        vote,
        "El servidor ya tenía el voto contrario; se conserva ese voto.",
      );
    this.confirmed.set(canonical.movie_id, canonical);
    this.pending = this.pending.filter((v) => v !== vote);
  }
  reconcile(room: VotingRoom) {
    if (this.stopped || room.session.id !== this.room.session.id || room.me.id !== this.room.me.id)
      return;
    this.room = room;
    for (const vote of room.votes) {
      if (vote.participant_id !== room.me.id) continue;
      const movie = room.movies.find((m) => m.id === vote.movie_id);
      if (!movie) continue;
      const canonical = { ...vote, round: movie.round };
      this.confirmed.set(vote.movie_id, canonical);
      for (const pending of [...this.pending]) {
        if (pending.movie_id === vote.movie_id && pending.round === movie.round)
          this.acknowledge(pending, canonical);
      }
    }
    for (const vote of this.pending) {
      if (!this.eligible(vote))
        vote.error = this.unsaved(
          vote,
          "La ronda o tu acceso cambiaron. Descarta este voto para continuar.",
        );
    }
    // Never replace HTTP confirmations with an older in-flight snapshot.
    this.persist();
    void this.flush();
  }
  revoke() {
    if (this.stopped) return;
    this.revoked = true;
    for (const vote of this.pending)
      vote.error = this.unsaved(
        vote,
        "Tu acceso ya no está activo. Descarta este voto para salir.",
      );
    this.persist();
  }
  retry() {
    if (this.stopped) return;
    if (!this.storageLoaded) this.restore();
    this.conflict = "";
    this.reconcile(this.room);
    for (const vote of this.pending) {
      if (this.eligible(vote)) delete vote.error;
    }
    this.persist();
    void this.flush();
  }
  discardFailed() {
    if (this.stopped) return;
    this.pending = this.pending.filter((v) => !v.error);
    this.conflict = "";
    this.persist();
  }
  dispose() {
    this.stopped = true;
    this.controller.abort();
  }
  private async flush() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      let vote: PendingVote | undefined;
      while (!this.stopped && (vote = this.pending.find((v) => !v.error))) {
        for (let attempt = 0; attempt < 3; attempt++) {
          if (this.stopped || !this.pending.includes(vote) || vote.error) break;
          try {
            const receipt = await this.send(vote, this.controller.signal);
            if (this.stopped) return;
            if (
              receipt.type !== "vote_saved" ||
              receipt.round !== vote.round ||
              receipt.participant_id !== vote.participant_id ||
              receipt.movie_id !== vote.movie_id ||
              typeof receipt.liked !== "boolean"
            )
              throw new Error("Confirmación de voto inválida");
            this.acknowledge(vote, receipt);
            this.persist();
            break;
          } catch (error) {
            if (this.stopped) return;
            const status = (error as { status?: number }).status;
            const definitive =
              status && status >= 400 && status < 500 && ![408, 429].includes(status);
            if (!definitive && attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, [500, 1500][attempt]));
              continue;
            }
            // A timed-out POST may have committed. Reconcile before declaring any loss.
            await this.refresh().catch(() => {});
            if (this.stopped) return;
            if (this.pending.includes(vote)) {
              vote.error = this.unsaved(
                vote,
                `${(error as Error).message}. Reintenta o descarta el voto.`,
              );
              this.persist();
            }
            break;
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
