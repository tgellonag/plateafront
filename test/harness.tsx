import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { API_URL, type Filters, type Movie, type Person, type State } from "@/lib/api";
import type { Providers } from "@/app/use-providers";
import type { Room } from "@/app/use-room";
import { WelcomeDraftProvider } from "@/app/welcome-draft";
import { navigation } from "./navigation";

export const host: Person = { id: "host", name: "Ana", is_host: true, progress: 0 };
export const guest: Person = { id: "guest", name: "Beto", is_host: false, progress: 0 };
export const filters: Filters = {
  genre_ids: [],
  provider_ids: [],
  min_year: 2000,
  max_runtime: 150,
};
export const access = { session_id: "room-1", token: "a".repeat(64) };

export function movie(id: number, title: string, overrides: Partial<Movie> = {}): Movie {
  return {
    id,
    title,
    overview: "",
    year: 2020,
    runtime: 90,
    genre_ids: [],
    provider_ids: [8],
    rating: 7.5,
    round: 1,
    position: id,
    likes: 0,
    dislikes: 0,
    score: 0,
    match: false,
    ...overrides,
  };
}

export const lobbyState: State = {
  session: { id: "room-1", status: "open", filters, round: 0, chosen_movie_id: null },
  me: host,
  participants: [host, guest],
  movies: [],
  votes: [],
  invitation: { code: "ABC234", expires_at: "2099-01-01T00:00:00Z" },
};

export const votingState: State = {
  ...lobbyState,
  session: { ...lobbyState.session, status: "voting", round: 1 },
  movies: [movie(1, "Primera"), movie(2, "Segunda")],
  invitation: null,
};

export const providers: Providers = {
  list: [{ provider_id: 8, provider_name: "Netflix" }],
  names: { 8: "Netflix" },
  loading: false,
  error: "",
  stale: false,
  load: async () => {},
};

export function fakeRoom(overrides: Partial<Room> = {}): Room {
  return {
    access,
    state: null,
    voteQueue: null,
    error: "",
    setError: vi.fn(),
    notice: "",
    setNotice: vi.fn(),
    busy: false,
    filtersPending: false,
    setFiltersPending: vi.fn(),
    booting: false,
    recentAccess: null,
    management: false,
    finished: false,
    results: false,
    refresh: vi.fn(async () => {}),
    run: vi.fn(),
    enter: vi.fn(async () => true),
    resume: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    ...overrides,
  };
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

type Handler = (body: never) => unknown;

export function fakeApi(routes: Record<string, Handler>) {
  const calls: { route: string; body: unknown; token?: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const route = `${init.method} ${url.slice(API_URL.length)}`;
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    const authorization = (init.headers as Record<string, string>).Authorization;
    calls.push({ route, body, token: authorization?.replace("Bearer ", "") });
    const handler = routes[route];
    if (!handler) return json({ error: `Ruta inesperada ${route}` }, 500);
    const reply = await handler(body as never);
    return reply instanceof Response ? reply : json(reply);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    routes,
    calls,
    count: (route: string) => calls.filter((call) => call.route === route).length,
    bodies: (route: string) => calls.filter((call) => call.route === route).map((c) => c.body),
  };
}

export class FakeSocket {
  static all: FakeSocket[] = [];
  sent: string[] = [];
  closed = false;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  static get latest() {
    return FakeSocket.all[FakeSocket.all.length - 1];
  }
}

export function setupBrowserFakes() {
  const { showModal, close } = HTMLDialogElement.prototype;
  beforeEach(() => {
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    sessionStorage.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    Object.values(navigation.router).forEach((method) => method.mockClear());
  });
  afterEach(() => {
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
}

export function renderAt(path: string, ui: ReactNode) {
  navigation.pathname = path;
  history.replaceState({}, "", path);
  return render(<WelcomeDraftProvider>{ui}</WelcomeDraftProvider>);
}
