"use client";

import { LogOut } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import { RankingList } from "./ranking";
import { FiltersSummary } from "./filters-form";
import type { Providers } from "../use-providers";

export function Management({
  room,
  state,
  providers,
}: {
  room: Room;
  state: State;
  providers: Providers;
}) {
  const { busy, leave } = room;
  return (
    <>
      <RankingList room={room} state={state} />
      <FiltersSummary filters={state.session.filters} providers={providers} />
      <div className="actions">
        <button disabled={busy} onClick={leave}>
          <LogOut aria-hidden="true" />
          Salir
        </button>
      </div>
    </>
  );
}
