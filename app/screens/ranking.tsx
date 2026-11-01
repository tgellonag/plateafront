"use client";

import { useState } from "react";
import { Check, Heart, Star } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import { Poster } from "./poster";
import { Sheet } from "./sheet";

export function RankingList({ room, state }: { room: Room; state: State }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const { busy, run } = room;
  const { session } = state;
  const host = state.me.is_host;
  const movie = state.movies.find((m) => m.id === selected);
  return (
    <section className="panel">
      <h2>Ranking</h2>
      <ol id="movie-ranking" className="ranking">
        {(expanded ? state.movies : state.movies.slice(0, 5)).map((m) => (
          <li key={m.id} className={m.match ? "matched" : ""}>
            <button className="ranking-row" onClick={() => setSelected(m.id)}>
              <span className="ranking-position">
                {m.match && (
                  <>
                    <Heart className="match-heart" aria-hidden="true" />
                    <span className="sr-only">Match</span>
                  </>
                )}
              </span>
              <Poster movie={m} thumbnail />
              <div className="ranking-details">
                <strong className="ranking-title">{m.title}</strong>
                {m.match && <span className="match-tag">Match</span>}
                <small className="vote-counts">
                  <Heart aria-hidden="true" />
                  <span className="sr-only">Me gusta: </span>
                  {m.likes}
                </small>
              </div>
            </button>
            {session.chosen_movie_id === m.id ? (
              <span className="chosen">
                <Check aria-hidden="true" />
                Elegida
              </span>
            ) : (
              host &&
              session.status === "closed" &&
              !session.chosen_movie_id && (
                <button disabled={busy} onClick={() => run("confirm", { movie_id: m.id })}>
                  Elegir
                </button>
              )
            )}
          </li>
        ))}
      </ol>
      {state.movies.length > 5 && (
        <button
          className="ranking-toggle"
          aria-expanded={expanded}
          aria-controls="movie-ranking"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Mostrar menos" : "Mostrar más"}
        </button>
      )}
      <Sheet open={!!movie} onClose={() => setSelected(null)} variant="center">
        {movie && (
          <div className="movie-detail">
            <h2>{movie.title}</h2>
            <p className="movie-detail-meta">
              {movie.year} · {movie.runtime} min
            </p>
            <span className="rating">
              <Star aria-hidden="true" />
              {movie.rating.toFixed(1)}
            </span>
            <p className="movie-detail-overview">{movie.overview || "Sin sinopsis disponible."}</p>
            {[true, false].map((liked) => {
              const names = state.votes
                .filter((v) => v.movie_id === movie.id && v.liked === liked)
                .map(
                  (v) =>
                    state.participants.find((p) => p.id === v.participant_id)?.name ??
                    v.participant_name ??
                    "Participante",
                );
              return (
                <p key={String(liked)}>
                  {liked ? "Me gusta" : "No me gusta"}: {names.length ? names.join(", ") : "-"}
                </p>
              );
            })}
          </div>
        )}
      </Sheet>
    </section>
  );
}
