"use client";

import { useContext, useState } from "react";
import { redirect, usePathname } from "next/navigation";
import { LoaderCircle, LogIn, Plus } from "lucide-react";
import { RoomContext } from "../use-room";
import { emptyWelcomeDraft, useWelcomeDraft } from "../welcome-draft";
import { TmdbAttribution } from "./tmdb-attribution";

export function WelcomeSession() {
  const pathname = usePathname();
  const namePath = pathname.startsWith("/join/") ? pathname.split("/").slice(0, 3).join("/") : "/";
  const [draft, setDraft] = useWelcomeDraft();
  const [pendingAction, setPendingAction] = useState<"join" | "create" | null>(null);
  const room = useContext(RoomContext);
  if (!room) throw new Error("Platea is required");
  const { busy, enter } = room;
  const { name } = draft;
  const code =
    draft.code ??
    (namePath === "/" ? "" : decodeURIComponent(namePath.split("/")[2]).toUpperCase());

  if (!name) redirect(namePath);

  async function connect(create: boolean) {
    if (busy) return;
    setPendingAction(create ? "create" : "join");
    if (await enter(create, { name, code })) setDraft(emptyWelcomeDraft);
  }
  return (
    <section className="welcome">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || code.length !== 6) return;
          void connect(false);
        }}
      >
        <h1>Hola, {name}</h1>
        <label>
          Código de invitación
          <input
            autoFocus // NOSONAR: único campo de la pantalla, el foco inicial es intencional
            required
            value={code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            maxLength={6}
            minLength={6}
            pattern="[A-Z2-9]{6}"
            placeholder="ABC234"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="code-input"
          />
        </label>
        <button type="submit" className="primary" disabled={busy || code.length !== 6}>
          {busy && pendingAction === "join" ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Conectando…
            </>
          ) : (
            <>
              <LogIn aria-hidden="true" />
              Unirse
            </>
          )}
        </button>
        <div className="divider">o</div>
        <button type="button" disabled={busy} onClick={() => void connect(true)}>
          {busy && pendingAction === "create" ? (
            <>
              <LoaderCircle className="animate-spin" aria-hidden="true" />
              Conectando…
            </>
          ) : (
            <>
              <Plus aria-hidden="true" />
              Crear sesión
            </>
          )}
        </button>
      </form>
      <TmdbAttribution />
    </section>
  );
}
