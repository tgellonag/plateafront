"use client";

import { LogOut, RefreshCw, WifiOff } from "lucide-react";
import type { ReactNode } from "react";
import { RoomContext, useRoom } from "./use-room";
import { useProviders } from "./use-providers";
import { WelcomeName } from "./screens/welcome-name";
import { Lobby } from "./screens/lobby";
import { Voting } from "./screens/voting";
import { Results, OptionsMenu } from "./screens/results";

export function Platea({ children }: { children?: ReactNode }) {
  const room = useRoom();
  const providers = useProviders();
  const { access, state, voteQueue, error, notice, busy, booting, recentAccess, results } = room;
  const session = state?.session;
  return (
    <RoomContext value={room}>
      <main className="shell app-shell" aria-busy={busy || booting}>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button
              onClick={() => (access ? void room.refresh() : void room.resume())}
              disabled={busy || (!access && !recentAccess)}
            >
              <RefreshCw aria-hidden="true" /> Reintentar
            </button>
            {access && !state && (
              <button disabled={busy} onClick={room.leave}>
                <LogOut aria-hidden="true" />
                Salir
              </button>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="notice">
            {notice}
          </p>
        )}
        {!state && !access && !booting ? (
          (children ?? <WelcomeName />)
        ) : state && session ? (
          <>
            <div className="room-heading">
              <div>
                {session.status === "voting" && (
                  <p className="round-label">Ronda {session.round}</p>
                )}
                <h1>{results ? "Ranking" : session.status === "open" ? "Sala" : "Votación"}</h1>
              </div>
              <div className="room-status">
                {!!voteQueue?.errors.length && (
                  <button
                    className="connection-warning"
                    aria-label="Sin conexión. Reintentar envío de votos"
                    title="Sin conexión"
                    onClick={() => {
                      void room.refresh().then(() => voteQueue.retry());
                    }}
                  >
                    <WifiOff size={18} aria-hidden="true" />
                  </button>
                )}
                {session.round === 0 ? (
                  <button disabled={busy} onClick={room.leave}>
                    <LogOut aria-hidden="true" />
                    Salir
                  </button>
                ) : session.status === "voting" || session.status === "closed" ? (
                  <OptionsMenu room={room} state={state} providers={providers} />
                ) : null}
              </div>
            </div>
            {session.status === "open" ? (
              <Lobby room={room} state={state} providers={providers} />
            ) : results ? (
              <Results room={room} state={state} />
            ) : session.status === "voting" ? (
              <Voting room={room} state={state} providers={providers} />
            ) : null}
          </>
        ) : null}
      </main>
    </RoomContext>
  );
}
