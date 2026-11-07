"use client";

import { useEffect, useMemo } from "react";
import { Heart, X } from "lucide-react";
import { request, type Movie, type State } from "@/lib/api";
import { TrailerCache, type Trailer } from "../trailer-cache";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import type { VoteQueue } from "../vote-queue";
import { posterSrc } from "./poster";
import { MovieCard } from "./movie-card";

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
  const currentID = current?.id;
  const nextID = remaining[1]?.id;
  const sessionID = room.access?.session_id;
  const token = room.access?.token;
  const trailers = useMemo(
    () =>
      new TrailerCache(async (movieID, signal) => {
        const result = await request<{ trailer: Trailer | null }>(
          `/api/v1/sessions/${sessionID}/movies/${movieID}/trailer`,
          token,
          undefined,
          signal,
        );
        return result.trailer;
      }),
    [sessionID, token],
  );
  useEffect(() => () => trailers.clear(), [trailers]);
  useEffect(() => {
    const ids = [currentID, nextID].filter((id): id is number => id !== undefined);
    trailers.retain(ids);
    if (!sessionID || !token) return;
    // Let the poster and rapid voting settle before spending bandwidth on trailers.
    const timer = setTimeout(() => {
      for (const id of ids) void trailers.load(id).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [trailers, currentID, nextID, sessionID, token]);
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
  if (!current || !room.access) return null;
  return (
    <section className="voting">
      <MovieCard key={current.id} movie={current} providers={providers} trailers={trailers} />
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
