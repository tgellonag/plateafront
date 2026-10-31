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
import { VoteQueue, shouldRefreshRoom, type VoteReceipt } from "./vote-queue";
import { API_URL, RequestError, request, type Access, type State } from "@/lib/api";

const noSubscription = () => () => {};
const zero = () => 0;

async function resumeAccess(saved: Access) {
  await request(`/api/v1/sessions/${saved.session_id}/resume`, saved.token, {});
  return saved;
}

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
  const management =
    state?.session.status === "closed" || (managementRoute && (state?.session.round ?? 0) > 0);
  useSyncExternalStore(
    voteQueue?.subscribe ?? noSubscription,
    voteQueue?.getSnapshot ?? zero,
    zero,
  );
  useEffect(() => {
    if (managementRoute && state?.session.round === 0)
      history.replaceState({}, "", `/room/${state.session.id}`);
  }, [managementRoute, state?.session.round, state?.session.id]);
  const refreshing = useRef<Promise<void> | null>(null),
    generation = useRef(0),
    leaving = useRef(false),
    refreshPending = useRef(false),
    queueRef = useRef<VoteQueue | null>(null),
    refreshLatest = useRef<() => Promise<void>>(async () => {}),
    managementRef = useRef(management);
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
    refreshing.current = null;
    refreshPending.current = false;
    queueRef.current?.revoke();
    setBusy(false);
    setState(null);
    setError("Tu acceso a la sala ya no está activo");
  }, []);
  const activate = useCallback(async (next: Access, signal?: AbortSignal) => {
    setRecentAccess(next);
    setNotice("");
    try {
      sessionStorage.setItem(`platea-${next.session_id}`, JSON.stringify(next));
      sessionStorage.setItem("platea-recent", JSON.stringify(next));
      sessionStorage.setItem("platea-last", next.session_id);
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
    refreshing.current = null;
    refreshPending.current = false;
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
  }, []);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (cancelled) return;
      const parts = location.pathname.split("/");
      try {
        const recent = sessionStorage.getItem("platea-recent");
        if (recent) setRecentAccess(JSON.parse(recent));
      } catch {
        /* El acceso guardado es opcional. */
      }
      if (parts[1] === "join") {
        setBooting(false);
        return;
      }
      try {
        const id = parts[1] === "room" ? parts[2] : sessionStorage.getItem("platea-last");
        const saved = id && sessionStorage.getItem(`platea-${id}`);
        if (saved) {
          setBusy(true);
          const restored = await resumeAccess(JSON.parse(saved));
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
    if (refreshing.current) {
      refreshPending.current = true;
      return refreshing.current;
    }
    const version = generation.current;
    const task = (async () => {
      try {
        do {
          refreshPending.current = false;
          const next = await request<State>(`/api/v1/sessions/${access.session_id}`, access.token);
          if (version !== generation.current || leaving.current) return;
          queueRef.current?.reconcile(next);
          setState(next);
          setError("");
        } while (refreshPending.current);
      } catch (e) {
        if (version !== generation.current || leaving.current) return;
        if (e instanceof RequestError && (e.status === 401 || e.status === 404)) invalidateAccess();
        else setError((e as Error).message);
      } finally {
        if (version === generation.current) refreshing.current = null;
      }
    })();
    refreshing.current = task;
    return task;
  }, [access, invalidateAccess]);
  useEffect(() => {
    refreshLatest.current = refresh;
    managementRef.current = management;
    if (access) void refresh();
  }, [access, refresh, management]);
  useEffect(() => {
    if (!access) return;
    const version = generation.current;
    let stopped = false,
      ws: WebSocket,
      timer: ReturnType<typeof setTimeout>,
      delay = 1000;
    function connect() {
      ws = new WebSocket(
        `${API_URL.replace(/^http/, "ws")}/api/v1/sessions/${access!.session_id}/ws`,
      );
      ws.onopen = () => {
        if (stopped || version !== generation.current || leaving.current) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ token: access!.token }));
        delay = 1000;
        void refresh();
      };
      ws.onmessage = (event) => {
        if (
          !stopped &&
          version === generation.current &&
          !leaving.current &&
          shouldRefreshRoom(event.data, managementRef.current)
        )
          void refresh();
      };
      ws.onclose = (event) => {
        if (stopped || version !== generation.current || leaving.current) return;
        if (!stopped && event.code !== 1008) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
        } else if (event.code === 1008) {
          invalidateAccess();
        }
      };
      ws.onerror = () => ws.close();
    }
    connect();
    const focus = () => {
      if (version === generation.current && !leaving.current) void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      window.removeEventListener("focus", focus);
    };
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
  async function enter(
    create: boolean,
    { name, code, isTest }: { name: string; code: string; isTest: boolean },
  ) {
    setBusy(true);
    setError("");
    try {
      const tokens = new Set<string>();
      if (recentAccess) tokens.add(recentAccess.token);
      try {
        for (const key of Object.keys(sessionStorage)) {
          if (!/^platea-[a-f0-9-]{36}$/.test(key)) continue;
          try {
            const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Access | null;
            if (saved?.token?.length === 64) tokens.add(saved.token);
          } catch {
            /* Ignorar registros locales inválidos. */
          }
        }
      } catch {
        /* Se puede ingresar sin almacenamiento local. */
      }
      const next = await request<Access>(
        create ? "/api/v1/sessions" : "/api/v1/join",
        undefined,
        create ? { name, is_test: isTest } : { name, code, tokens: [...tokens].slice(-64) },
      );
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
    refreshing.current = null;
    refreshPending.current = false;
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
    refresh,
    run,
    enter,
    resume,
    leave,
  };
}
