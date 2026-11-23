"use client";

import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useWelcomeDraft } from "../welcome-draft";
import { TmdbAttribution } from "./tmdb-attribution";

export function WelcomeName() {
  const router = useRouter();
  const pathname = usePathname();
  const [draft, setDraft] = useWelcomeDraft();
  const name = draft.name.trim();
  const hasVisibleName = /[^\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}\p{M}]/u.test(
    name,
  );

  return (
    <section className="welcome">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!hasVisibleName) return;
          setDraft({ ...draft, name });
          router.push(pathname.startsWith("/join/") ? `${pathname}/start` : "/start");
        }}
      >
        <h1>¿Cómo te llamas?</h1>
        <label>
          <span className="sr-only">Tu nombre</span>
          <input
            autoFocus // NOSONAR: único campo de la pantalla, el foco inicial es intencional
            required
            maxLength={30}
            autoComplete="nickname"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Nombre"
          />
        </label>
        <button type="submit" className="primary" disabled={!hasVisibleName}>
          Continuar
          <ArrowRight aria-hidden="true" />
        </button>
      </form>
      <TmdbAttribution />
    </section>
  );
}
