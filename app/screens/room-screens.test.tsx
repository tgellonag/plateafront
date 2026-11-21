import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Filters, Movie, State } from "@/lib/api";
import type { Providers } from "../use-providers";
import type { Room } from "../use-room";
import { VoteQueue } from "../vote-queue";
import { FiltersForm, FiltersSummary } from "./filters-form";
import { Lobby } from "./lobby";
import { Results } from "./results";
import { Voting } from "./voting";

const host = { id: "host", name: "Ana", is_host: true, progress: 0 };
const guest = { id: "guest", name: "Beto", is_host: false, progress: 0 };
const filters: Filters = { genre_ids: [], provider_ids: [], min_year: 2000, max_runtime: 150 };

const providers: Providers = {
  list: [{ provider_id: 8, provider_name: "Netflix" }],
  names: { 8: "Netflix" },
  loading: false,
  error: "",
  stale: false,
  load: async () => {},
};

const room: Room = {
  access: null,
  state: null,
  voteQueue: null,
  error: "",
  setError: () => {},
  notice: "",
  setNotice: () => {},
  busy: false,
  filtersPending: false,
  setFiltersPending: () => {},
  booting: false,
  recentAccess: null,
  management: false,
  finished: false,
  results: false,
  refresh: async () => {},
  run: () => {},
  enter: async () => false,
  resume: async () => {},
  leave: async () => {},
};

const votingState: State = {
  session: { id: "room-1", status: "voting", filters, round: 1, chosen_movie_id: null },
  me: host,
  participants: [host, guest],
  movies: [],
  votes: [],
  invitation: null,
};

function movie(id: number, title: string, overrides: Partial<Movie> = {}): Movie {
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

function buttonAttributes(html: string, label: string) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(([, , content]) =>
    content.endsWith(label),
  )?.[1];
}

describe("Lobby", () => {
  const lobby: State = {
    ...votingState,
    session: { ...votingState.session, status: "open", round: 0 },
    invitation: { code: "ABC234", expires_at: "2027-01-01T00:00:00Z" },
  };

  it("ROOM-R8 blocks the host from starting alone and enables start when a guest joins", () => {
    const alone = renderToStaticMarkup(
      <Lobby room={room} state={{ ...lobby, participants: [host] }} providers={providers} />,
    );
    const withGuest = renderToStaticMarkup(
      <Lobby room={room} state={lobby} providers={providers} />,
    );

    expect(buttonAttributes(alone, "Iniciar votación")).toContain('disabled=""');
    const start = buttonAttributes(withGuest, "Iniciar votación");
    expect(start).toBeDefined();
    expect(start).not.toContain("disabled");
    expect(withGuest).toContain("ABC234");
    expect(withGuest).toContain("Participantes (2/12)");
    expect(buttonAttributes(withGuest, "Expulsar")).toBeDefined();
  });

  it("ROOM-R8 shows a guest the waiting message without administration controls", () => {
    const html = renderToStaticMarkup(
      <Lobby room={room} state={{ ...lobby, me: guest, invitation: null }} providers={providers} />,
    );

    expect(html).toContain("Esperando que el anfitrión inicie la votación.");
    expect(html).toContain("Ana · Anfitrión");
    expect(buttonAttributes(html, "Iniciar votación")).toBeUndefined();
    expect(buttonAttributes(html, "Expulsar")).toBeUndefined();
  });
});

describe("Voting", () => {
  const votingRoom = {
    ...room,
    access: { session_id: votingState.session.id, token: "room-token" },
  };

  it("VOTE-R7 skips the host's confirmed and pending votes but keeps a guest's vote eligible", () => {
    const state: State = {
      ...votingState,
      movies: [
        movie(4, "Después"),
        movie(3, "Siguiente", { provider_ids: [8, 99] }),
        movie(2, "Pendiente local"),
        movie(1, "Ya confirmada"),
      ],
      votes: [
        { participant_id: host.id, movie_id: 1, liked: true },
        { participant_id: guest.id, movie_id: 3, liked: false },
      ],
    };
    const queue = new VoteQueue(
      state,
      () => ({ getItem: () => null, setItem: () => {} }),
      () => new Promise(() => {}),
      async () => {},
    );
    queue.enqueue(2, false);
    const html = renderToStaticMarkup(
      <Voting room={{ ...votingRoom, voteQueue: queue }} state={state} providers={providers} />,
    );
    queue.dispose();

    expect(html).toContain("<h2>Siguiente</h2>");
    expect(html).toContain("Netflix, Servicio 99");
    expect(html).not.toContain("Pendiente local");
    expect(html).not.toContain("Ya confirmada");
    expect(html).not.toContain("Después");
  });

  it("VOTE-R7 renders no voting card after the only candidate has been voted", () => {
    const state: State = {
      ...votingState,
      movies: [movie(1, "Ya confirmada")],
      votes: [{ participant_id: host.id, movie_id: 1, liked: false }],
    };

    expect(
      renderToStaticMarkup(<Voting room={votingRoom} state={state} providers={providers} />),
    ).toBe("");
  });
});

describe("Results", () => {
  it("RANK-R4 keeps the server's order, marks a match and initially shows only five candidates", () => {
    const state = {
      ...votingState,
      movies: [
        movie(8, "Primera", { likes: 2, match: true }),
        movie(1, "Segunda"),
        movie(3, "Tercera"),
        movie(4, "Cuarta"),
        movie(5, "Quinta"),
        movie(6, "Sexta"),
      ],
    };
    const html = renderToStaticMarkup(<Results room={room} state={state} />);

    expect(
      [...html.matchAll(/<strong class="ranking-title">(.*?)<\/strong>/g)].map((m) => m[1]),
    ).toEqual(["Primera", "Segunda", "Tercera", "Cuarta", "Quinta"]);
    expect(html).toContain('<span class="match-tag">Match</span>');
    expect(html.match(/class="match-tag"/g)).toHaveLength(1);
    expect(buttonAttributes(html, "Mostrar más")).toContain('aria-expanded="false"');
  });

  it("RANK-R5 gives the host administration controls even after finishing their own votes", () => {
    const html = renderToStaticMarkup(
      <Results room={{ ...room, finished: true }} state={votingState} />,
    );

    expect(html).toContain("Ya votaste todas las películas disponibles.");
    expect(buttonAttributes(html, "Continuar votando")).toBeUndefined();
    expect(buttonAttributes(html, "Agregar películas")).toBeDefined();
    expect(buttonAttributes(html, "Terminar votación")).toBeDefined();
  });

  it("RANK-R5 lets a guest continue voting without offering host controls", () => {
    const html = renderToStaticMarkup(
      <Results room={room} state={{ ...votingState, me: guest }} />,
    );

    expect(buttonAttributes(html, "Continuar votando")).toBeDefined();
    expect(buttonAttributes(html, "Agregar películas")).toBeUndefined();
    expect(buttonAttributes(html, "Terminar votación")).toBeUndefined();
  });

  it("CLOSE-R3 lets only the host choose a movie when voting has closed", () => {
    const state: State = {
      ...votingState,
      session: { ...votingState.session, status: "closed" },
      movies: [movie(2, "Finalista")],
    };
    const forHost = renderToStaticMarkup(<Results room={room} state={state} />);
    const forGuest = renderToStaticMarkup(<Results room={room} state={{ ...state, me: guest }} />);

    expect(buttonAttributes(forHost, "Elegir")).toBeDefined();
    expect(buttonAttributes(forGuest, "Elegir")).toBeUndefined();
    expect(buttonAttributes(forHost, "Continuar votando")).toBeUndefined();
  });

  it("CLOSE-R3 shows the chosen movie and stops offering a choice", () => {
    const state: State = {
      ...votingState,
      session: { ...votingState.session, status: "closed", chosen_movie_id: 3 },
      movies: [movie(2, "Finalista"), movie(3, "Ganadora")],
    };
    for (const me of [host, guest]) {
      const html = renderToStaticMarkup(<Results room={room} state={{ ...state, me }} />);

      expect(html).toMatch(/Ganadora(?:(?!<\/li>).)*Elegida/);
      expect(buttonAttributes(html, "Elegir")).toBeUndefined();
    }
  });

  it("AI-R1 tells players they can keep voting when Gemini fails, but not when there were no votes", () => {
    const withCuration = (batch_curation: State["session"]["batch_curation"]) =>
      renderToStaticMarkup(
        <Results
          room={room}
          state={{ ...votingState, session: { ...votingState.session, batch_curation } }}
        />,
      );
    const failed = withCuration({ method: "popularity", reason: "http_error", detail: "HTTP 400" });
    const noVotes = withCuration({ method: "popularity", reason: "no_votes" });

    expect(failed).toContain("Gemini respondió con un error.");
    expect(failed).toContain("puedes seguir votando");
    expect(failed).toContain('<p class="curation-detail">HTTP 400</p>');
    expect(noVotes).not.toContain("puedes seguir votando");
  });
});

describe("Filters", () => {
  it("FIL-R4 shows all categories and services when neither has a selection", () => {
    const html = renderToStaticMarkup(<FiltersSummary filters={filters} providers={providers} />);

    expect(html).toContain("<dd>Todos</dd>");
    expect(html).toContain("<dd>Todos los servicios</dd>");
  });

  it("FIL-R4 identifies filters whose labels are missing from the current catalog", () => {
    const selected = { ...filters, genre_ids: [18, 999], provider_ids: [8, 99] };
    const html = renderToStaticMarkup(<FiltersSummary filters={selected} providers={providers} />);

    expect(html).toContain("Drama, Género 999");
    expect(html).toContain("Netflix, Servicio 99");
    expect(html).toContain("150 min");
  });

  it.each([
    ["loading", { loading: true }, "Cargando servicios…"],
    ["error", { error: "Servicio no disponible" }, "Servicio no disponible"],
    ["cached", { stale: true }, "Lista guardada; puede haber cambiado."],
  ])("FIL-R5 displays the %s state of the streaming catalog", (_, overrides, message) => {
    const html = renderToStaticMarkup(
      <FiltersForm room={room} providers={{ ...providers, ...overrides }} saved={filters} />,
    );

    expect(html).toContain(message);
  });
});
