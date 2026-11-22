"use client";

import { useState } from "react";
import { ListPlus, LogOut, MoreHorizontal, Play, Square, Users } from "lucide-react";
import type { PopularityReason, State } from "@/lib/api";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import { RankingList } from "./ranking";
import { FiltersSummary } from "./filters-form";
import { PreferenceForm } from "./preference-form";
import { Sheet } from "./sheet";

function hostActions(state: State) {
  const { session } = state;
  return {
    canAddMovies: state.me.is_host && session.status === "voting",
    canClose: state.me.is_host && session.status === "voting",
  };
}

const popularityReasons: Record<PopularityReason, string> = {
  no_votes: "Todavía no había votos para estimar los gustos del grupo.",
  timeout: "Gemini no respondió a tiempo.",
  not_configured: "Gemini no está configurado.",
  busy: "Gemini está ocupado con otra sala; reintenta.",
  quota: "Se agotó la cuota de Gemini.",
  http_error: "", // the keep-voting notice and the HTTP detail already say it
  network: "No se pudo conectar con Gemini.",
  incomplete: "Gemini cortó su respuesta.",
  invalid_response: "Gemini respondió en un formato inesperado.",
  invalid_selection: "Gemini eligió películas que no estaban entre las candidatas.",
  unavailable: "Gemini no pudo entregar una selección válida.",
};

function BatchCuration({ state }: { state: State }) {
  const { batch_curation: curation, round } = state.session;
  if (!curation) return null;
  const selectedCount = state.movies.filter((movie) => movie.round === round).length;
  // A backend newer than this build may send a reason we don't know yet.
  const reason =
    curation.method === "popularity"
      ? (popularityReasons[curation.reason] ?? popularityReasons.unavailable)
      : "";
  const selectedFromLargerPool = (curation.candidate_count ?? 0) > selectedCount;
  return (
    <section className="panel batch-curation" aria-live="polite">
      <h2>{curation.method === "affinity" ? "Selección de Gemini" : "Lote por popularidad"}</h2>
      {curation.method === "affinity" ? (
        <>
          <p>
            {selectedFromLargerPool
              ? `Gemini eligió ${selectedCount} de ${curation.candidate_count} candidatas según los votos del grupo.`
              : "Gemini ordenó las películas disponibles según los votos del grupo."}
          </p>
          <p>{curation.summary}</p>
        </>
      ) : (
        <>
          {curation.reason === "no_votes" ? (
            <p>{reason}</p>
          ) : (
            <>
              <p>
                Gemini no está funcionando ahora, pero puedes seguir votando: este lote se armó por
                popularidad.
              </p>
              {(reason || curation.detail) && (
                <details className="curation-detail">
                  <summary>Detalles</summary>
                  {reason && <p>{reason}</p>}
                  {curation.detail && <p>{curation.detail}</p>}
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function Results({ room, state }: { room: Room; state: State }) {
  const { busy, run, finished } = room;
  const { session } = state;
  const { canAddMovies, canClose } = hostActions(state);
  const canContinue = session.status === "voting" && !finished;
  return (
    <>
      {session.status === "voting" && <BatchCuration state={state} />}
      <RankingList room={room} state={state} />
      {session.status === "closed" && session.group_profile && (
        <section className="panel" aria-live="polite">
          <h2>Perfil del grupo con Gemini</h2>
          <p>{session.group_profile}</p>
        </section>
      )}
      {session.status === "voting" && (
        <div className="action-bar">
          {finished && (
            <p className="ranking-status">Ya votaste todas las películas disponibles.</p>
          )}
          {canContinue && (
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
              <ListPlus aria-hidden="true" />
              Agregar películas
            </button>
          )}
          {canClose && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Terminar la votación? Ya no se podrán recibir más votos."))
                  run("close");
              }}
            >
              <Square aria-hidden="true" />
              Terminar votación
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
        {state.me.is_host && session.status === "voting" && (
          <section className="options-preference">
            <PreferenceForm room={room} saved={session.group_preference ?? ""} />
          </section>
        )}
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
          {session.status === "voting" && results && !finished && (
            <button
              onClick={() => {
                setOpen(false);
                history.pushState({}, "", `/room/${session.id}`);
              }}
            >
              Continuar votando
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              history.pushState({}, "", `/room/${session.id}/participants`);
            }}
          >
            <Users aria-hidden="true" />
            Administrar participantes
          </button>
          {canAddMovies && (
            <button
              disabled={busy}
              onClick={() => {
                setOpen(false);
                run("next");
              }}
            >
              <ListPlus aria-hidden="true" />
              Agregar películas
            </button>
          )}
          {canClose && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Terminar la votación? Ya no se podrán recibir más votos.")) {
                  setOpen(false);
                  run("close");
                }
              }}
            >
              <Square aria-hidden="true" />
              Terminar votación
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
