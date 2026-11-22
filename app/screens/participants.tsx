import { ListOrdered, Play } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import { Invitation } from "./lobby";
import { ParticipantList } from "./participant-list";

export function Participants({ room, state }: { room: Room; state: State }) {
  const { session } = state;
  const canContinue = session.status === "voting" && !room.finished;
  return (
    <>
      <ParticipantList room={room} state={state} />
      {session.status === "voting" && state.me.is_host && state.invitation && (
        <div className="lobby">
          <Invitation room={room} invitation={state.invitation} />
        </div>
      )}
      <div className="action-bar">
        <button
          className="continue-voting"
          onClick={() =>
            history.pushState({}, "", `/room/${session.id}${canContinue ? "" : "/manage"}`)
          }
        >
          {canContinue ? <Play aria-hidden="true" /> : <ListOrdered aria-hidden="true" />}
          {canContinue ? "Continuar votando" : "Ver ranking"}
        </button>
      </div>
    </>
  );
}
