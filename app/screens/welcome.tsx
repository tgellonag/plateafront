"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, LoaderCircle, LogIn, Plus } from "lucide-react";
import type { Room } from "../use-room";

export function Welcome({ room }: { room: Room }) {
  const pathname = usePathname();
  const [name, setName] = useState(""),
    [nameConfirmed, setNameConfirmed] = useState(false),
    [code, setCode] = useState(() => {
      const [, page, value] = pathname.split("/");
      return page === "join" ? decodeURIComponent(value ?? "").toUpperCase() : "";
    }),
    [isTest, setIsTest] = useState(false);
  const { busy, enter } = room;
  if (!nameConfirmed) {
    return (
      <section className="welcome">
        <form
          key="name"
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            setName(name.trim());
            setNameConfirmed(true);
          }}
        >
          <h1>¿Cómo te llamas?</h1>
          <label>
            <span className="sr-only">Tu nombre</span>
            <input
              autoFocus
              required
              maxLength={30}
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
            />
          </label>
          <button className="primary" disabled={busy || !name.trim()}>
            Continuar
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
      </section>
    );
  }
  return (
    <section className="welcome">
      <form
        key="session"
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || code.length !== 6) return;
          void enter(false, { name, code, isTest });
        }}
      >
        <h1>Hola, {name}</h1>
        <p role="status" className="connection-status">
          {busy && (
            <>
              <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
              Conectando…
            </>
          )}
        </p>
        <label>
          Código de invitación
          <input
            autoFocus
            required
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
        <button className="primary" disabled={busy || code.length !== 6}>
          <LogIn aria-hidden="true" />
          Unirse
        </button>
        <div className="divider">o</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void enter(true, { name, code, isTest })}
        >
          <Plus aria-hidden="true" />
          Crear sesión
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
