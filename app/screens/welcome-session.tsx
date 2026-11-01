"use client";

import { useContext, useState } from "react";
import { redirect, usePathname } from "next/navigation";
import { LoaderCircle, LogIn, Plus } from "lucide-react";
import { RoomContext } from "../use-room";
import { emptyWelcomeDraft, useWelcomeDraft } from "../welcome-draft";

export function WelcomeSession() {
  const pathname = usePathname();
  const namePath = pathname.startsWith("/join/") ? pathname.split("/").slice(0, 3).join("/") : "/";
  const [draft, setDraft] = useWelcomeDraft();
  const [pendingAction, setPendingAction] = useState<"join" | "create" | null>(null);
  const room = useContext(RoomContext);
  if (!room) throw new Error("Platea is required");
  const { busy, enter } = room;
  const { name, isTest } = draft;
  const code =
    draft.code ??
    (namePath === "/" ? "" : decodeURIComponent(namePath.split("/")[2]).toUpperCase());

  if (!name) redirect(namePath);

  async function connect(create: boolean) {
    if (busy) return;
    setPendingAction(create ? "create" : "join");
    if (await enter(create, { name, code, isTest })) setDraft(emptyWelcomeDraft);
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
            autoFocus
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
        <button className="primary" disabled={busy || code.length !== 6}>
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
        <details className="session-options">
          <summary>Opciones</summary>
          <label className="test-option">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(e) => setDraft({ ...draft, isTest: e.target.checked })}
            />
            Sesión de demostración (excluir de métricas)
          </label>
        </details>
      </form>
    </section>
  );
}
