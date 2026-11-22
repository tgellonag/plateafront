import { UserRoundMinus } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";

export function ParticipantList({ room, state }: { room: Room; state: State }) {
  const { busy, run } = room;
  const canKick = state.me.is_host && state.session.status !== "closed";
  return (
    <ul className="people" aria-label="Participantes">
      {state.participants.map((p) => (
        <li key={p.id}>
          <span>
            {p.name}
            {p.is_host ? " · Anfitrión" : ""}
          </span>
          {canKick && !p.is_host && p.id !== state.me.id && (
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm(`¿Expulsar a ${p.name} de la sesión?`))
                  run("kick", { participant_id: p.id });
              }}
            >
              <UserRoundMinus aria-hidden="true" />
              Expulsar
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
