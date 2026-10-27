"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Film,
  Heart,
  LogIn,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  UserRoundMinus,
  Users,
  X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const genres: Record<number, string> = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "TV",
  53: "Suspenso",
  10752: "Bélica",
  37: "Western",
};
type Provider = { provider_id: number; provider_name: string };
type Filters = {
  genre_ids: number[];
  provider_ids: number[];
  min_year: number;
  max_runtime: number;
  movie_count: number;
};
type Movie = {
  id: number;
  title: string;
  overview: string;
  year: number;
  runtime: number;
  genre_ids: number[];
  provider_ids: number[];
  rating: number;
  round: number;
  position: number;
  likes: number;
  dislikes: number;
  score: number;
  match: boolean;
};
type Person = { id: string; name: string; is_host: boolean; progress: number };
type State = {
  session: {
    id: string;
    status: "open" | "voting" | "closed";
    filters: Filters;
    group_profile: string;
    round: number;
    chosen_movie_id: number | null;
  };
  me: Person;
  participants: Person[];
  movies: Movie[];
  votes: { participant_id: string; movie_id: number; liked: boolean; participant_name?: string }[];
  invitation: { code: string; expires_at: string } | null;
};
type Access = { session_id: string; token: string };
class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(API + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
      : AbortSignal.timeout(90000),
  });
  const data = await res
    .json()
    .catch(() => ({ error: "El servidor no respondió. Puede estar iniciándose; reintenta." }));
  if (!res.ok)
    throw new RequestError(data.error ?? "No se pudo completar la solicitud", res.status);
  return data;
}
async function resumeAccess(saved: Access) {
  await request(`/api/v1/sessions/${saved.session_id}/resume`, saved.token, {});
  return saved;
}
function Poster({ movie, thumbnail = false }: { movie: Movie; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = thumbnail ? "poster ranking-poster" : "poster";
  return failed ? (
    <div
      className={`${className} placeholder`}
      role="img"
      aria-label={`Sin afiche de ${movie.title}`}
    >
      {thumbnail ? <Film aria-hidden="true" /> : movie.title}
    </div>
  ) : (
    <Image
      unoptimized
      width={thumbnail ? 40 : 500}
      height={thumbnail ? 60 : 750}
      className={className}
      src={`${API}/api/v1/movies/${movie.id}/poster`}
      alt={`Afiche de ${movie.title}`}
      onError={() => setFailed(true)}
    />
  );
}

export function Platea() {
  const pathname = usePathname();
  const managementRoute = pathname.endsWith("/manage");
  const [access, setAccess] = useState<Access | null>(null),
    [state, setState] = useState<State | null>(null),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copyCount, setCopyCount] = useState(0),
    [busy, setBusy] = useState(false),
    [booting, setBooting] = useState(true),
    [prompt, setPrompt] = useState(""),
    [qr, setQr] = useState(""),
    [seconds, setSeconds] = useState(300),
    [isTest, setIsTest] = useState(false),
    [recentAccess, setRecentAccess] = useState<Access | null>(null),
    [providerList, setProviderList] = useState<Provider[]>([]),
    [providerLoading, setProviderLoading] = useState(true),
    [providerError, setProviderError] = useState(""),
    [providerStale, setProviderStale] = useState(false),
    [providerSearch, setProviderSearch] = useState(""),
    [filters, setFilters] = useState<Filters | null>(null);
  const management =
    state?.session.status === "closed" || (managementRoute && (state?.session.round ?? 0) > 0);
  useEffect(() => {
    if (!copyCount) return;
    const timer = setTimeout(() => setCopyCount(0), 1000);
    return () => clearTimeout(timer);
  }, [copyCount]);
  useEffect(() => {
    if (managementRoute && state?.session.round === 0)
      history.replaceState({}, "", `/room/${state.session.id}`);
  }, [managementRoute, state?.session.round, state?.session.id]);
  const providers: Record<number, string> = Object.fromEntries(
    providerList.map((p) => [p.provider_id, p.provider_name]),
  );
  const providerOptions = [
    ...providerList,
    ...(filters?.provider_ids ?? [])
      .filter((id) => !providers[id])
      .map((id) => ({ provider_id: id, provider_name: `Servicio ${id}` })),
  ].filter((p) =>
    p.provider_name.toLocaleLowerCase("es").includes(providerSearch.trim().toLocaleLowerCase("es")),
  );
  const loadProviders = useCallback(async () => {
    setProviderLoading(true);
    setProviderError("");
    try {
      const result = await request<{ providers: Provider[]; stale: boolean }>("/api/v1/providers");
      setProviderList(result.providers);
      setProviderStale(result.stale);
    } catch (e) {
      setProviderError((e as Error).message);
    } finally {
      setProviderLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadProviders();
    });
    return () => {
      cancelled = true;
    };
  }, [loadProviders]);
  const refreshing = useRef(false),
    generation = useRef(0),
    leaving = useRef(false),
    refreshPending = useRef(false);
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
    refreshing.current = false;
    refreshPending.current = false;
    leaving.current = false;
    setState(ready);
    setFilters(ready.session.filters);
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
        setCode(decodeURIComponent(parts[2] ?? "").toUpperCase());
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
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshPending.current = true;
      return;
    }
    refreshing.current = true;
    const version = generation.current;
    try {
      do {
        refreshPending.current = false;
        const next = await request<State>(`/api/v1/sessions/${access?.session_id}`, access?.token);
        if (version !== generation.current || leaving.current) return;
        setState(next);
        setFilters((old) => old ?? next.session.filters);
        setError("");
      } while (refreshPending.current);
    } catch (e) {
      if (version !== generation.current || leaving.current) return;
      if (e instanceof RequestError && (e.status === 401 || e.status === 404)) setState(null);
      setError((e as Error).message);
    } finally {
      if (version === generation.current) refreshing.current = false;
    }
  }, [access]);
  useEffect(() => {
    if (access) void Promise.resolve().then(refresh);
  }, [access, refresh]);
  useEffect(() => {
    if (!access) return;
    const version = generation.current;
    let stopped = false,
      ws: WebSocket,
      timer: ReturnType<typeof setTimeout>,
      delay = 1000;
    function connect() {
      ws = new WebSocket(`${API.replace(/^http/, "ws")}/api/v1/sessions/${access!.session_id}/ws`);
      ws.onopen = () => {
        if (stopped || version !== generation.current || leaving.current) {
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ token: access!.token }));
        delay = 1000;
        void refresh();
      };
      ws.onmessage = () => {
        if (!stopped && version === generation.current && !leaving.current) void refresh();
      };
      ws.onclose = (event) => {
        if (stopped || version !== generation.current || leaving.current) return;
        if (!stopped && event.code !== 1008) {
          timer = setTimeout(connect, delay);
          delay = Math.min(delay * 2, 30000);
        } else if (event.code === 1008) {
          setError("Tu acceso a la sala ya no está activo");
          setState(null);
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
  }, [access, refresh]);
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
        if (action === "filters") setNotice("Filtros guardados");
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
    if (!invitation) return;
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
  useEffect(() => {
    if (!invitation || busy) return;
    const timer = setInterval(() => {
      if (Date.parse(invitation.expires_at) - Date.now() <= 15000)
        void act("rotate").catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [invitation, busy, act]);
  async function enter(create: boolean) {
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
    } catch (e) {
      setError((e as Error).message);
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
  async function leave() {
    if (busy || leaving.current) return;
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
    refreshing.current = false;
    refreshPending.current = false;
    try {
      sessionStorage.removeItem("platea-last");
    } catch {
      /* El token en memoria sigue siendo válido hasta salir. */
    }
    setAccess(null);
    setBusy(false);
    setState(null);
    setFilters(null);
    setError("");
    setNotice("");
    leaving.current = false;
    history.pushState({}, "", "/");
  }
  const session = state?.session,
    me = state?.me,
    host = !!me?.is_host;
  const roundMovies =
    state?.movies
      .filter((m) => m.round === session?.round)
      .sort((a, b) => a.position - b.position) ?? [];
  const ownVotes = new Set(
    state?.votes.filter((v) => v.participant_id === me?.id).map((v) => v.movie_id),
  );
  const current = roundMovies.find((m) => !ownVotes.has(m.id));
  const matches = state?.movies.filter((m) => m.match) ?? [];
  return (
    <main className="shell app-shell" aria-busy={busy || booting}>
      {error && (
        <div role="alert" className="alert">
          {error}
          <button
            onClick={() => (access ? void refresh() : void resume())}
            disabled={busy || (!access && !recentAccess)}
          >
            <RefreshCw aria-hidden="true" /> Reintentar
          </button>
          {access && !state && (
            <button disabled={busy} onClick={leave}>
              <LogOut aria-hidden="true" />
              Salir
            </button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!state && !access && !booting ? (
        <section className="welcome">
          <form
            className="panel"
            onSubmit={(e) => {
              e.preventDefault();
              void enter(false);
            }}
          >
            <h1>Crear o unirse</h1>
            <label>
              Tu nombre
              <input
                required
                maxLength={30}
                autoComplete="nickname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
              />
            </label>
            <button
              type="button"
              className="primary"
              disabled={busy || !name.trim()}
              onClick={() => void enter(true)}
            >
              <Plus aria-hidden="true" />
              {busy ? "Conectando…" : "Crear sesión"}
            </button>
            <div className="divider">o</div>
            <label>
              Código de invitación
              <input
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
            <button disabled={busy || code.length !== 6 || !name.trim()}>
              <LogIn aria-hidden="true" />
              Unirse
            </button>
            <details className="session-options">
              <summary>Opciones</summary>
              <label className="test-option">
                <input
                  type="checkbox"
                  checked={isTest}
                  onChange={(e) => setIsTest(e.target.checked)}
                />
                Sesión de demostración (excluir de métricas)
              </label>
            </details>
          </form>
        </section>
      ) : state ? (
        <>
          <div className="room-heading">
            <div>
              {session?.status === "voting" && <p className="round-label">Ronda {session.round}</p>}
              <h1>{management ? "Sesión" : session?.status === "open" ? "Sala" : "Votación"}</h1>
            </div>
            <div className="room-status">
              {session?.round === 0 ? (
                <button disabled={busy} onClick={leave}>
                  <LogOut aria-hidden="true" />
                  Salir
                </button>
              ) : session?.status !== "closed" ? (
                <button
                  disabled={busy}
                  onClick={() => {
                    history.pushState({}, "", `/room/${session?.id}${management ? "" : "/manage"}`);
                    window.scrollTo(0, 0);
                  }}
                >
                  {management ? <ArrowLeft aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
                  {management ? "Volver" : "Sesión"}
                </button>
              ) : null}
            </div>
          </div>
          {management && session?.status !== "closed" && (
            <section className="panel">
              <h2>Rondas</h2>
              <p>
                {state.participants.filter((p) => p.progress === roundMovies.length).length} de{" "}
                {state.participants.length} participantes terminaron.
              </p>
              {host && session?.status === "voting" && (
                <div className="actions">
                  <button disabled={busy} onClick={() => run("close")}>
                    <Square aria-hidden="true" />
                    Cerrar votación
                  </button>
                  {session.round === 1 && matches.length === 0 && (
                    <button disabled={busy} onClick={() => run("next")}>
                      <Play aria-hidden="true" />
                      Segunda ronda
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {!management &&
            (session?.status === "open" ? (
              <div className="room-grid">
                <section className="panel lobby">
                  <h2>Invitación</h2>
                  {host && invitation ? (
                    <>
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
                          aria-label={
                            copyCount ? "Código copiado. Copiar de nuevo" : "Copiar código"
                          }
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
                            <Check
                              key={copyCount}
                              className="copy-confirmation"
                              aria-hidden="true"
                            />
                          ) : (
                            <Copy aria-hidden="true" />
                          )}
                          Copiar código
                        </button>
                        <button
                          onClick={() => void share(`${location.origin}/join/${invitation.code}`)}
                        >
                          <Share2 aria-hidden="true" />
                          Compartir
                        </button>
                        <button disabled={busy} onClick={() => run("rotate")}>
                          <RefreshCw aria-hidden="true" />
                          Nuevo código
                        </button>
                      </div>
                    </>
                  ) : (
                    <p>Esperando que el anfitrión inicie la votación.</p>
                  )}
                  <h3>
                    <Users aria-hidden="true" />
                    Participantes ({state.participants.length}/12)
                  </h3>
                  <ul className="people">
                    {state.participants.map((p) => (
                      <li key={p.id}>
                        <span>
                          {p.name}
                          {p.is_host ? " · anfitrión" : ""}
                        </span>
                        {host && !p.is_host && p.id !== me?.id && (
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
                </section>
                {host && (
                  <div className="actions">
                    <button
                      className="primary"
                      disabled={busy || state.participants.length < 2}
                      onClick={() => run("start")}
                    >
                      <Play aria-hidden="true" />
                      {busy ? "Preparando películas…" : "Iniciar votación"}
                    </button>
                  </div>
                )}
                {host && filters && (
                  <details className="panel settings">
                    <summary>
                      <SlidersHorizontal aria-hidden="true" />
                      Filtros
                      <ChevronDown className="disclosure-icon" aria-hidden="true" />
                    </summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        run("filters", filters);
                      }}
                    >
                      <fieldset>
                        <legend>Géneros</legend>
                        <div className="chips">
                          {Object.entries(genres).map(([id, title]) => (
                            <label key={id}>
                              <input
                                type="checkbox"
                                checked={filters.genre_ids.includes(+id)}
                                onChange={(e) =>
                                  setFilters({
                                    ...filters,
                                    genre_ids: e.target.checked
                                      ? [...filters.genre_ids, +id]
                                      : filters.genre_ids.filter((v) => v !== +id),
                                  })
                                }
                              />
                              {title}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>Streaming en Chile</legend>
                        {providerLoading && <p role="status">Cargando servicios…</p>}
                        {providerError && (
                          <div className="provider-error">
                            <p role="alert">{providerError}</p>
                            <button
                              type="button"
                              disabled={providerLoading}
                              onClick={() => void loadProviders()}
                            >
                              <RefreshCw aria-hidden="true" />
                              Reintentar
                            </button>
                          </div>
                        )}
                        {providerStale && <small>Lista guardada; puede haber cambiado.</small>}
                        {providerList.length > 12 && (
                          <label>
                            Buscar servicio
                            <input
                              type="search"
                              value={providerSearch}
                              onChange={(e) => setProviderSearch(e.target.value)}
                              placeholder="Nombre del servicio"
                            />
                          </label>
                        )}
                        <div className="chips provider-options">
                          {providerOptions.map(({ provider_id: id, provider_name: title }) => (
                            <label key={id}>
                              <input
                                type="checkbox"
                                checked={filters.provider_ids.includes(+id)}
                                onChange={(e) =>
                                  setFilters({
                                    ...filters,
                                    provider_ids: e.target.checked
                                      ? [...filters.provider_ids, +id]
                                      : filters.provider_ids.filter((v) => v !== +id),
                                  })
                                }
                              />
                              {title}
                            </label>
                          ))}
                        </div>
                        {!providerLoading && !providerError && providerOptions.length === 0 && (
                          <p>No hay servicios que coincidan.</p>
                        )}
                        <small>El filtro de películas considera solo suscripciones.</small>
                      </fieldset>
                      <label>
                        Año desde
                        <input
                          type="number"
                          min={1888}
                          max={new Date().getFullYear() + 2}
                          value={filters.min_year}
                          onChange={(e) => setFilters({ ...filters, min_year: +e.target.value })}
                        />
                      </label>
                      <label>
                        Duración máxima (min)
                        <input
                          type="number"
                          min={1}
                          max={600}
                          value={filters.max_runtime}
                          onChange={(e) => setFilters({ ...filters, max_runtime: +e.target.value })}
                        />
                      </label>
                      <label>
                        Películas por ronda
                        <input
                          type="number"
                          min={5}
                          max={20}
                          value={filters.movie_count}
                          onChange={(e) => setFilters({ ...filters, movie_count: +e.target.value })}
                        />
                      </label>
                      <button disabled={busy}>
                        <Save aria-hidden="true" />
                        Guardar filtros
                      </button>
                      <small>
                        Sin selección se incluyen todos. Guarda los cambios antes de iniciar.
                      </small>
                    </form>
                  </details>
                )}
              </div>
            ) : (
              <>
                {session?.status === "voting" && (
                  <section className="voting">
                    {current ? (
                      <>
                        <article className="movie-card" key={current.id}>
                          <Poster movie={current} />
                          <div className="movie-copy">
                            <h2>{current.title}</h2>
                            <p>
                              {current.year} · {current.runtime} min
                            </p>
                            <span className="rating">
                              <Star aria-hidden="true" />
                              {current.rating.toFixed(1)}
                            </span>
                            <small>
                              Streaming:{" "}
                              {current.provider_ids
                                .map((id) => providers[id] ?? `Servicio ${id}`)
                                .join(", ") || "Sin información"}
                            </small>
                          </div>
                        </article>
                        <div className="vote-actions">
                          <button
                            disabled={busy}
                            onClick={() => run("vote", { movie_id: current.id, liked: false })}
                          >
                            <X aria-hidden="true" />
                            No me gusta
                          </button>
                          <button
                            className="primary"
                            disabled={busy}
                            onClick={() => run("vote", { movie_id: current.id, liked: true })}
                          >
                            <Heart aria-hidden="true" />
                            Me gusta
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="finished panel">
                        <h2>
                          <Check aria-hidden="true" />
                          Ronda completada
                        </h2>
                        <p>Votos guardados. Esperando al anfitrión.</p>
                      </div>
                    )}
                  </section>
                )}
              </>
            ))}
          {management && (
            <section className="panel">
              <h2>
                {matches.length > 0 && <Heart aria-hidden="true" />}
                {matches.length
                  ? "Match"
                  : session?.status === "closed"
                    ? "Ranking"
                    : "Ranking provisional"}
              </h2>
              <ol className="ranking">
                {state.movies.map((m) => (
                  <li key={m.id} className={m.match ? "matched" : ""}>
                    <Poster movie={m} thumbnail />
                    <div>
                      <strong>{m.title}</strong>
                      <small className="vote-counts">
                        <span>
                          <Heart aria-hidden="true" />
                          <span className="sr-only">Me gusta: </span>
                          {m.likes}
                        </span>
                        <span>
                          <X aria-hidden="true" />
                          <span className="sr-only">No me gusta: </span>
                          {m.dislikes}
                        </span>
                      </small>
                      <details>
                        <summary>Ver votos</summary>
                        <div className="others">
                          {[true, false].map((liked) => {
                            const names = state.votes
                              .filter((v) => v.movie_id === m.id && v.liked === liked)
                              .map(
                                (v) =>
                                  state.participants.find((p) => p.id === v.participant_id)?.name ??
                                  v.participant_name ??
                                  "Participante",
                              );
                            return (
                              <div key={String(liked)}>
                                {liked ? "Me gusta" : "No me gusta"}:{" "}
                                {names.length ? `${names.join(", ")}.` : "-"}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </div>
                    {session?.chosen_movie_id === m.id ? (
                      <span className="chosen">
                        <Check aria-hidden="true" />
                        Elegida
                      </span>
                    ) : (
                      host &&
                      session?.status === "closed" &&
                      !session.chosen_movie_id && (
                        <button disabled={busy} onClick={() => run("confirm", { movie_id: m.id })}>
                          Elegir
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          {(management || session?.status === "open") && (
            <details className="panel profile" open>
              <summary>
                <Sparkles aria-hidden="true" />
                Perfil con IA
                <ChevronDown className="disclosure-icon" aria-hidden="true" />
              </summary>
              <div>
                <p>
                  {session?.group_profile ||
                    "Sin perfil generado. La IA no modifica los votos ni el ranking."}
                </p>
              </div>
              {host && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("profile", { prompt });
                  }}
                >
                  <label>
                    Preferencias (opcional)
                    <textarea
                      maxLength={500}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Ej. comedia, menos de dos horas"
                    />
                  </label>
                  <button disabled={busy}>
                    <Sparkles aria-hidden="true" />
                    {busy ? "Procesando…" : "Generar perfil"}
                  </button>
                </form>
              )}
            </details>
          )}
          {management && (
            <div className="actions">
              <button disabled={busy} onClick={leave}>
                <LogOut aria-hidden="true" />
                Salir
              </button>
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}
