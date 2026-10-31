"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useWelcomeDraft } from "../welcome-draft";

export function WelcomeName() {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useWelcomeDraft();

  return (
    <section className="welcome">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;
          setDraft({ ...draft, name: draft.name.trim() });
          router.push(pathname.startsWith("/join/") ? `${pathname}/start` : "/start");
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
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Nombre"
          />
        </label>
        <button className="primary" disabled={!draft.name.trim()}>
          Continuar
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
    </section>
  );
}
