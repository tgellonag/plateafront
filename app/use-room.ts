"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import { enterRoom, resumeAccess, savedRoomAccess, saveRoomAccess } from "./room-access";
import { createRoomRefresher, watchRoom } from "./room-live";
import { VoteQueue, type VoteReceipt } from "./vote-queue";
import { remainingMovies } from "./screens/voting";
import { RequestError, request, type Access, type State } from "@/lib/api";

const noSubscription = () => () => {};
const zero = () => 0;

export type Room = ReturnType<typeof useRoom>;
export const RoomContext = createContext<Room | null>(null);

// Session lifecycle: boot/resume, live sync, actions and leaving. Screens only render.
export function useRoom() {
  const pathname = usePathname();
  const managementRoute = pathname.endsWith("/manage");
  const [access, setAccess] = useState<Access | null>(null),
    [voteQueue, setVoteQueue] = useState<VoteQueue | null>(null),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filtersPending, setFiltersPending] = useState(false),
    [booting, setBooting] = useState(true),
    [recentAccess, setRecentAccess] = useState<Access | null>(null);
  const management = state?.session.status === "closed";
  const finished =
    !!state && state.session.status === "voting" && remainingMovies(state, voteQueue).length === 0;
  const results =
    management || (state?.session.status === "voting" && (finished || managementRoute));
  useSyncExternalStore(
    voteQueue?.subscribe ?? noSubscription,
    voteQueue?.getSnapshot ?? zero,
    zero,
  );
  useEffect(() => {
    // Make the results route sticky before another batch can extend the deck.
    if (state?.session.status === "voting" && finished && !managementRoute)
      history.replaceState({}, "", `/room/${state.session.id}/manage`);
    else if (managementRoute && state?.session.round === 0)
      history.replaceState({}, "", `/room/${state.session.id}`);
  }, [managementRoute, state, finished]);
  const [refresher] = useState(createRoomRefresher);
  const generation = useRef(0),
    leaving = useRef(false),
    queueRef = useRef<VoteQueue | null>(null),
    refreshLatest = useRef<() => Promise<void>>(async () => {}),
    managementRef = useRef(management || results);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!queueRef.current?.hasPending) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      queueRef.current?.dispose();
    };
  }, []);
  const invalidateAccess = useCallback(() => {
    generation.current++;
    refresher.reset();
    queueRef.current?.revoke();
    setBusy(false);
    setState(null);
    setError("Tu acceso a la sala ya no está activo");
  }, [refresher]);
  const activate = useCallback(
    async (next: Access, signal?: AbortSignal) => {
      setRecentAccess(next);
      setNotice("");
      try {
        saveRoomAccess(next);
      } catch {
        setNotice(
          "El navegador no permite guardar tu acceso. No recargues ni cierres esta pestaña durante la sesión.",
        );
      }
      const ready = await request<State>(
        `/api/v1/sessions/${next.session_id}`,
        next.token,
        undefined,
        signal,
      );
      if (signal?.aborted) return;
      generation.current++;
      refresher.reset();
      leaving.current = false;
      queueRef.current?.dispose();
      const queue = new VoteQueue(
        ready,
        () => sessionStorage,
        (vote, signal) =>
          request<VoteReceipt>(
            `/api/v1/sessions/${next.session_id}/vote`,
            next.token,
            { round: vote.round, movie_id: vote.movie_id, liked: vote.liked },
            AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          ),
        () => refreshLatest.current(),
      );
      queueRef.current = queue;
      setVoteQueue(queue);
      setState(ready);
      setAccess(next);
      const path = `/room/${next.session_id}`;
      if (location.pathname !== path && location.pathname !== `${path}/manage`)
        history.pushState({}, "", path);
    },
    [refresher],
  );
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (cancelled) return;
      const pathname = location.pathname;
      try {
        const recent = sessionStorage.getItem("platea-recent");
        if (recent) setRecentAccess(JSON.parse(recent));
      } catch {
        /* El acceso guardado es opcional. */
      }
      if (pathname.split("/")[1] === "join") {
        setBooting(false);
        return;
      }
      try {
        const saved = savedRoomAccess(pathname);
        if (saved) {
          setBusy(true);
          const restored = await resumeAccess(saved);
          if (!cancelled) await activate(restored, controller.signal);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) {
          setBusy(false);
          setBooting(false);
        }
      }
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activate]);
  const refresh = useCallback((): Promise<void> => {
    if (!access || leaving.current) return Promise.resolve();
    const version = generation.current;
    return refresher.refresh(
      () => request<State>(`/api/v1/sessions/${access.session_id}`, access.token),
      (next) => {
        queueRef.current?.reconcile(next);
        setState(next);
        setError("");
      },
      (error) => {
        if (error instanceof RequestError && (error.status === 401 || error.status === 404))
          invalidateAccess();
        else setError((error as Error).message);
      },
      () => version === generation.current && !leaving.current,
    );
  }, [access, invalidateAccess, refresher]);
  useEffect(() => {
    refreshLatest.current = refresh;
    managementRef.current = management || results;
    if (access) void refresh();
  }, [access, refresh, management, results]);
  useEffect(() => {
    if (!access) return;
    const version = generation.current;
    return watchRoom({
      access,
      refresh,
      invalidateAccess,
      isCurrent: () => version === generation.current && !leaving.current,
      isRanking: () => managementRef.current,
    });
  }, [access, refresh, invalidateAccess]);
  const act = useCallback(
    async (action: string, body: unknown = {}) => {
      if (!access) return;
      const version = generation.current;
      setBusy(true);
      setError("");
      setNotice("");
      try {
        const result = await request<{ ok: boolean }>(
          `/api/v1/sessions/${access.session_id}/${action}`,
          access.token,
          body,
        );
        if (version !== generation.current) return;
        await refresh();
        return result;
      } catch (e) {
        if (version !== generation.current) return;
        await refresh().catch(() => {});
        setError((e as Error).message);
        throw e;
      } finally {
        if (version === generation.current) setBusy(false);
      }
    },
    [access, refresh],
  );
  const run = (action: string, body: unknown = {}) => {
    void act(action, body).catch(() => {});
  };
  const invitation = state?.invitation;
  useEffect(() => {
    if (!invitation || busy) return;
    const timer = setInterval(() => {
      if (Date.parse(invitation.expires_at) - Date.now() <= 15000)
        void act("rotate").catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [invitation, busy, act]);
  async function enter(create: boolean, { name, code }: { name: string; code: string }) {
    setBusy(true);
    setError("");
    try {
      const next = await enterRoom(create, { name, code }, recentAccess);
      await activate(next);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    if (!recentAccess || busy) return;
    setBusy(true);
    setError("");
    try {
      await activate(await resumeAccess(recentAccess));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function leave() {
    if (busy || leaving.current) return;
    if (
      queueRef.current?.hasPending &&
      !window.confirm(
        "Hay votos sin confirmar. ¿Salir de todos modos? Los votos no guardados podrían perderse.",
      )
    )
      return;
    if (access) {
      leaving.current = true;
      setBusy(true);
      setError("");
      try {
        await request(`/api/v1/sessions/${access.session_id}/leave`, access.token, {});
      } catch (e) {
        if (!(e instanceof RequestError) || (e.status !== 401 && e.status !== 404)) {
          leaving.current = false;
          setBusy(false);
          setAccess({ ...access });
          setError((e as Error).message);
          return;
        }
      }
      setRecentAccess(access);
      try {
        sessionStorage.setItem("platea-recent", JSON.stringify(access));
      } catch {
        /* Conservar el acceso en memoria. */
      }
    }
    generation.current++;
    queueRef.current?.revoke();
    queueRef.current?.dispose();
    queueRef.current = null;
    setVoteQueue(null);
    refresher.reset();
    try {
      sessionStorage.removeItem("platea-last");
    } catch {
      /* El token en memoria sigue siendo válido hasta salir. */
    }
    setAccess(null);
    setBusy(false);
    setState(null);
    setError("");
    setNotice("");
    leaving.current = false;
    history.pushState({}, "", "/");
  }
  return {
    access,
    state,
    voteQueue,
    error,
    setError,
    notice,
    setNotice,
    busy,
    filtersPending,
    setFiltersPending,
    booting,
    recentAccess,
    management,
    finished,
    results,
    refresh,
    run,
    enter,
    resume,
    leave,
  };
}
