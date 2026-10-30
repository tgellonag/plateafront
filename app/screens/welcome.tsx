"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogIn, Plus } from "lucide-react";
import type { Room } from "../use-room";

export function Welcome({ room }: { room: Room }) {
  const pathname = usePathname();
  const [name, setName] = useState(""),
    [code, setCode] = useState(() => {
      const [, page, value] = pathname.split("/");
      return page === "join" ? decodeURIComponent(value ?? "").toUpperCase() : "";
    }),
    [isTest, setIsTest] = useState(false);
  const { busy, enter } = room;
  return (
    <section className="welcome">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void enter(false, { name, code, isTest });
        }}
      >
        <h1>Crear o unirse</h1>
        <label>
          Tu nombre
          <input
            required
            maxLength={30}
            autoComplete="nickname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={busy || !name.trim()}
          onClick={() => void enter(true, { name, code, isTest })}
        >
          <Plus aria-hidden="true" />
          {busy ? "Conectando…" : "Crear sesión"}
        </button>
        <div className="divider">o</div>
        <label>
          Código de invitación
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
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
        <button disabled={busy || code.length !== 6 || !name.trim()}>
          <LogIn aria-hidden="true" />
          Unirse
        </button>
        <details className="session-options">
          <summary>Opciones</summary>
          <label className="test-option">
            <input type="checkbox" checked={isTest} onChange={(e) => setIsTest(e.target.checked)} />
            Sesión de demostración (excluir de métricas)
          </label>
        </details>
      </form>
    </section>
  );
}
