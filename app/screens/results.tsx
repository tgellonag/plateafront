"use client";

import { useState } from "react";
import { LogOut, MoreHorizontal, Play, Square, Users } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import { RankingList } from "./ranking";
import { FiltersSummary } from "./filters-form";
import { Sheet } from "./sheet";

function hostActions(state: State) {
  const { session } = state;
  return {
    canAddMovies: state.me.is_host && session.status === "voting",
    canClose: state.me.is_host && session.status === "voting",
  };
}

export function Results({ room, state }: { room: Room; state: State }) {
  const { busy, run, finished } = room;
  const { session } = state;
  const { canAddMovies, canClose } = hostActions(state);
  return (
    <>
      {finished && (
        <section className="panel ranking-status">
          <p>Ya votaste todas las películas disponibles.</p>
        </section>
      )}
      <RankingList room={room} state={state} />
      {(!finished || canAddMovies || canClose) && (
        <div className="action-bar">
          {!finished && (
            <button
              className="continue-voting"
              onClick={() => history.pushState({}, "", `/room/${session.id}`)}
            >
              <Play aria-hidden="true" />
              Continuar votando
            </button>
          )}
          {canAddMovies && (
            <button disabled={busy} onClick={() => run("next")}>
              <Play aria-hidden="true" />
              Agregar peliculas
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
  const { canAddMovies, canClose } = hostActions(state);
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
              Continuar votando
            </button>
          )}
          {canAddMovies && (
            <button
              disabled={busy}
              onClick={() => {
                setOpen(false);
                run("next");
              }}
            >
              <Play aria-hidden="true" />
              Agregar peliculas
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
