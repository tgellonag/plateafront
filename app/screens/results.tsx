"use client";

import { useState } from "react";
import { Heart, LogOut, MoreHorizontal, Play, Square, Users } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import { RankingList } from "./ranking";
import { FiltersSummary } from "./filters-form";
import { Sheet } from "./sheet";

function hostActions(room: Room, state: State) {
  const { session } = state;
  const matches = state.movies.filter((m) => m.match);
  return {
    canStartSecondRound:
      state.me.is_host && session.status === "voting" && session.round === 1 && matches.length === 0,
    canClose: state.me.is_host && session.status === "voting",
    matches,
  };
}

export function Results({ room, state }: { room: Room; state: State }) {
  const { busy, run } = room;
  const { session } = state;
  const roundSize = state.movies.filter((m) => m.round === session.round).length;
  const done = state.participants.filter((p) => p.progress === roundSize).length;
  const total = state.participants.length;
  const { canStartSecondRound, canClose, matches } = hostActions(room, state);
  return (
    <>
      <section className="panel progress-card">
        <p className="progress-label">
          {done} de {total} terminaron
        </p>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
        {matches.length > 0 && (
          <p className="match-banner">
            <Heart aria-hidden="true" />
            ¡Hay match! {matches[0].title}
          </p>
        )}
      </section>
      <RankingList room={room} state={state} />
      {(canStartSecondRound || canClose) && (
        <div className="action-bar">
          {canStartSecondRound && (
            <button disabled={busy} onClick={() => run("next")}>
              <Play aria-hidden="true" />
              Segunda ronda
            </button>
          )}
          {canClose && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Cerrar la votación? Ya no se podrán recibir más votos."))
                  run("close");
              }}
            >
              <Square aria-hidden="true" />
              Cerrar votación
            </button>
          )}
        </div>
      )}
    </>
  );
}

export function OptionsMenu({
  room,
  state,
  providers,
}: {
  room: Room;
  state: State;
  providers: Providers;
}) {
  const [open, setOpen] = useState(false);
  const { busy, run, leave, results, finished } = room;
  const { session } = state;
  const roundSize = state.movies.filter((m) => m.round === session.round).length;
  const { canStartSecondRound, canClose } = hostActions(room, state);
  return (
    <>
      <button aria-label="Opciones" onClick={() => setOpen(true)}>
        <MoreHorizontal aria-hidden="true" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <FiltersSummary filters={session.filters} providers={providers} />
        <section>
          <h3>
            <Users aria-hidden="true" />
            Participantes
          </h3>
          <ul className="people">
            {state.participants.map((p) => (
              <li key={p.id}>
                <span>
                  {p.name}
                  {p.is_host ? " · anfitrión" : ""}
                </span>
                <small>
                  {p.progress}/{roundSize}
                </small>
              </li>
            ))}
          </ul>
        </section>
        <div className="actions">
          {!results && (
            <button
              onClick={() => {
                setOpen(false);
                history.pushState({}, "", `/room/${session.id}/manage`);
              }}
            >
              Ver ranking
            </button>
          )}
          {results && !finished && (
            <button
              onClick={() => {
                setOpen(false);
                history.pushState({}, "", `/room/${session.id}`);
              }}
            >
              Volver a votar
            </button>
          )}
          {canStartSecondRound && (
            <button
              disabled={busy}
              onClick={() => {
                setOpen(false);
                run("next");
              }}
            >
              <Play aria-hidden="true" />
              Segunda ronda
            </button>
          )}
          {canClose && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Cerrar la votación? Ya no se podrán recibir más votos.")) {
                  setOpen(false);
                  run("close");
                }
              }}
            >
              <Square aria-hidden="true" />
              Cerrar votación
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => {
              setOpen(false);
              void leave();
            }}
          >
            <LogOut aria-hidden="true" />
            Salir
          </button>
        </div>
      </Sheet>
    </>
  );
}
