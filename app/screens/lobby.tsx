"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { Check, Copy, Play, RefreshCw, Share2, Users } from "lucide-react";
import type { State } from "@/lib/api";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";
import { FiltersForm } from "./filters-form";
import { ParticipantList } from "./participant-list";
import { PreferenceForm } from "./preference-form";

export function Invitation({
  room,
  invitation,
}: {
  room: Room;
  invitation: NonNullable<State["invitation"]>;
}) {
  const { busy, run, setError, setNotice } = room;
  const [copyCount, setCopyCount] = useState(0),
    [qr, setQr] = useState(""),
    [seconds, setSeconds] = useState(300);
  useEffect(() => {
    if (!copyCount) return;
    const timer = setTimeout(() => setCopyCount(0), 1000);
    return () => clearTimeout(timer);
  }, [copyCount]);
  useEffect(() => {
    const update = () => {
      const left = Math.max(0, Math.ceil((Date.parse(invitation.expires_at) - Date.now()) / 1000));
      setSeconds(left);
    };
    update();
    const timer = setInterval(update, 1000);
    void QRCode.toDataURL(`${location.origin}/join/${invitation.code}`, { width: 180, margin: 2 })
      .then(setQr)
      .catch(() => setQr(""));
    return () => clearInterval(timer);
  }, [invitation]);
  async function share(url: string) {
    try {
      if (navigator.share) await navigator.share({ title: "Platea", url });
      else {
        await navigator.clipboard.writeText(url);
        setNotice("Enlace copiado");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setNotice(url);
      }
    }
  }
  return (
    <section>
      <h2>Invitación</h2>
      <p className="code">{invitation.code}</p>
      <p>
        Vence en {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
      </p>
      {qr && (
        <Image
          unoptimized
          width={180}
          height={180}
          className="qr"
          src={qr}
          alt="QR de invitación a la sala"
        />
      )}
      <div className="actions invitation-actions">
        <button
          aria-label={copyCount ? "Código copiado. Copiar de nuevo" : "Copiar código"}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(invitation.code);
              setCopyCount((count) => count + 1);
            } catch {
              setError("No se pudo copiar el código. Cópialo manualmente.");
            }
          }}
        >
          {copyCount ? (
            <Check key={copyCount} className="copy-confirmation" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          Copiar código
        </button>
        <button onClick={() => void share(`${location.origin}/join/${invitation.code}`)}>
          <Share2 aria-hidden="true" />
          Compartir
        </button>
        <button disabled={busy} onClick={() => run("rotate")}>
          <RefreshCw aria-hidden="true" />
          Nuevo código
        </button>
      </div>
    </section>
  );
}

export function Lobby({
  room,
  state,
  providers,
}: {
  room: Room;
  state: State;
  providers: Providers;
}) {
  const { busy, run } = room;
  const host = state.me.is_host;
  return (
    <div className="room-grid">
      <section className="panel lobby">
        {host && state.invitation ? (
          <Invitation room={room} invitation={state.invitation} />
        ) : (
          <>
            <h2>Invitación</h2>
            <p>Esperando que el anfitrión inicie la votación.</p>
          </>
        )}
        <h3>
          <Users className="participants-icon" aria-hidden="true" />
          Participantes ({state.participants.length}/12)
        </h3>
        <ParticipantList room={room} state={state} />
      </section>
      {host && (
        <div className="actions">
          <button
            className="primary"
            disabled={busy || room.filtersPending || state.participants.length < 2}
            onClick={() => run("start")}
          >
            <Play aria-hidden="true" />
            {busy ? "Preparando películas…" : "Iniciar votación"}
          </button>
        </div>
      )}
      {host && (
        <section className="panel">
          <PreferenceForm room={room} saved={state.session.group_preference ?? ""} />
        </section>
      )}
      {host && <FiltersForm room={room} providers={providers} saved={state.session.filters} />}
    </div>
  );
}
