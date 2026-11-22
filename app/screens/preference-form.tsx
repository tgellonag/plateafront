"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Room } from "../use-room";

export const maxPreferenceLength = 120;

export function PreferenceForm({ room, saved }: { room: Room; saved: string }) {
  const [draft, setDraft] = useState(saved);
  const normalized = draft.trim().split(/\s+/).filter(Boolean).join(" ");
  return (
    <form
      className="preference"
      onSubmit={(e) => {
        e.preventDefault();
        room.run("preference", { group_preference: normalized });
      }}
    >
      <label>
        <span>
          <Sparkles aria-hidden="true" />
          ¿Qué tienen ganas de ver?
        </span>
        <textarea
          rows={2}
          maxLength={maxPreferenceLength}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ej.: algo liviano de los 90"
        />
      </label>
      <small>
        Opcional. Gemini lo usa al agregar películas. Solo tú lo ves.{" "}
        <span>
          {draft.length}/{maxPreferenceLength}
        </span>
      </small>
      <button disabled={room.busy || normalized === saved}>Guardar preferencia</button>
    </form>
  );
}
