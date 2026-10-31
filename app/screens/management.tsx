"use client";

import { Check, Heart, LogOut, Play, Square, X } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import { Poster } from "./poster";
import { FiltersSummary } from "./filters-form";
import type { Providers } from "../use-providers";

export function Management({
  room,
  state,
  providers,
}: {
  room: Room;
  state: State;
  providers: Providers;
}) {
  const { busy, run, leave } = room;
  const { session } = state;
  const host = state.me.is_host;
  const roundSize = state.movies.filter((m) => m.round === session.round).length;
  const matches = state.movies.filter((m) => m.match);
  return (
    <>
      {session.status !== "closed" && (
        <section className="panel">
          <h2>Rondas</h2>
          <p>
            {state.participants.filter((p) => p.progress === roundSize).length} de{" "}
            {state.participants.length} participantes terminaron.
          </p>
          {host && session.status === "voting" && (
            <div className="actions">
              <button disabled={busy} onClick={() => run("close")}>
                <Square aria-hidden="true" />
                Cerrar votación
              </button>
              {session.round === 1 && matches.length === 0 && (
                <button disabled={busy} onClick={() => run("next")}>
                  <Play aria-hidden="true" />
                  Segunda ronda
                </button>
              )}
            </div>
          )}
        </section>
      )}
      <section className="panel">
        <h2>
          {matches.length > 0 && <Heart aria-hidden="true" />}
          {matches.length
            ? "Match"
            : session.status === "closed"
              ? "Ranking"
              : "Ranking provisional"}
        </h2>
        <ol className="ranking">
          {state.movies.map((m) => (
            <li key={m.id} className={m.match ? "matched" : ""}>
              <Poster movie={m} thumbnail />
              <div>
                <strong>{m.title}</strong>
                <small className="vote-counts">
                  <span>
                    <Heart aria-hidden="true" />
                    <span className="sr-only">Me gusta: </span>
                    {m.likes}
                  </span>
                  <span>
                    <X aria-hidden="true" />
                    <span className="sr-only">No me gusta: </span>
                    {m.dislikes}
                  </span>
                </small>
                <details>
                  <summary>Ver votos</summary>
                  <div className="others">
                    {[true, false].map((liked) => {
                      const names = state.votes
                        .filter((v) => v.movie_id === m.id && v.liked === liked)
                        .map(
                          (v) =>
                            state.participants.find((p) => p.id === v.participant_id)?.name ??
                            v.participant_name ??
                            "Participante",
                        );
                      return (
                        <div key={String(liked)}>
                          {liked ? "Me gusta" : "No me gusta"}:{" "}
                          {names.length ? `${names.join(", ")}.` : "-"}
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
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
      </section>
      <FiltersSummary filters={session.filters} providers={providers} />
      <div className="actions">
        <button disabled={busy} onClick={leave}>
          <LogOut aria-hidden="true" />
          Salir
        </button>
      </div>
    </>
  );
}
