"use client";

import { useEffect } from "react";
import { Heart, Star, X } from "lucide-react";
import type { Movie, State } from "@/lib/api";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import type { VoteQueue } from "../vote-queue";
import { Poster, posterSrc } from "./poster";

export function remainingMovies(state: State, voteQueue: VoteQueue | null): Movie[] {
  const ownVotes = new Set(
    state.votes.filter((v) => v.participant_id === state.me.id).map((v) => v.movie_id),
  );
  return state.movies.filter((m) => !ownVotes.has(m.id) && !voteQueue?.hasVoted(m.id));
}

export function Voting({
  room,
  state,
  providers,
}: {
  room: Room;
  state: State;
  providers: Providers;
}) {
  const { busy, voteQueue } = room;
  const remaining = remainingMovies(state, voteQueue).sort((a, b) => a.position - b.position);
  const current = remaining[0];
  const upcomingPosters = remaining
    .slice(1, 3)
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (!upcomingPosters) return;
    upcomingPosters.split(",").forEach((id) => {
      const poster = new window.Image();
      poster.src = posterSrc(+id);
    });
  }, [upcomingPosters]);
  if (!current) return null;
  return (
    <section className="voting">
      <article className="movie-card" key={current.id}>
        <Poster movie={current} />
        <div className="movie-copy">
          <h2>{current.title}</h2>
          <p>
            {current.year} · {current.runtime} min
          </p>
          <span className="rating">
            <Star aria-hidden="true" />
            {current.rating.toFixed(1)}
          </span>
          <small>
            Streaming:{" "}
            {current.provider_ids.map((id) => providers.names[id] ?? `Servicio ${id}`).join(", ") ||
              "Sin información"}
          </small>
        </div>
      </article>
      <div className="vote-actions">
        <button disabled={busy} onClick={() => voteQueue?.enqueue(current.id, false)}>
          <X aria-hidden="true" />
          No me gusta
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => voteQueue?.enqueue(current.id, true)}
        >
          <Heart aria-hidden="true" />
          Me gusta
        </button>
      </div>
    </section>
  );
}
