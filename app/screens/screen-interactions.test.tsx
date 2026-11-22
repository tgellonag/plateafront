// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { State } from "@/lib/api";
import {
  access,
  fakeApi,
  fakeRoom,
  guest,
  host,
  json,
  lobbyState,
  movie,
  providers,
  setupBrowserFakes,
  votingState,
} from "@/test/harness";
import { TrailerCache, type Trailer } from "../trailer-cache";
import { VoteQueue } from "../vote-queue";
import { FiltersForm } from "./filters-form";
import { Lobby } from "./lobby";
import { MovieCard } from "./movie-card";
import { RankingList } from "./ranking";
import { OptionsMenu, Results } from "./results";
import { Voting } from "./voting";

setupBrowserFakes();

const invitationLink = "http://localhost:3000/join/ABC234";

function stubNavigator(value: Partial<Navigator>) {
  vi.stubGlobal("navigator", { ...navigator, ...value });
}

function withFakeDebounceTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("jest", { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  return userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
}

function renderLobby(room = fakeRoom()) {
  render(<Lobby room={room} state={lobbyState} providers={providers} />);
  return room;
}

describe("sharing the invitation", () => {
  it("INV-R9 confirms a copied code and reports a failed copy", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error());
    stubNavigator({ clipboard: { writeText } as unknown as Clipboard });
    const room = renderLobby();

    await user.click(screen.getByRole("button", { name: "Copiar código" }));
    const copied = await screen.findByRole("button", { name: "Código copiado. Copiar de nuevo" });
    expect(writeText).toHaveBeenCalledWith("ABC234");

    await user.click(copied);
    await waitFor(() =>
      expect(room.setError).toHaveBeenCalledWith(
        "No se pudo copiar el código. Cópialo manualmente.",
      ),
    );
  });

  it("INV-R9 shares the invitation link with the native share sheet", async () => {
    const user = userEvent.setup();
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share });
    const room = renderLobby();

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(share).toHaveBeenCalledWith({ title: "Platea", url: invitationLink });
    expect(room.setNotice).not.toHaveBeenCalled();
  });

  it("INV-R9 copies the link when the browser cannot share it", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator({ share: undefined, clipboard: { writeText } as unknown as Clipboard });
    const room = renderLobby();

    await user.click(screen.getByRole("button", { name: "Compartir" }));

    expect(writeText).toHaveBeenCalledWith(invitationLink);
    expect(room.setNotice).toHaveBeenCalledWith("Enlace copiado");
  });

  it.each([
    ["shows the link when sharing fails", new Error("sin permiso"), [invitationLink]],
    [
      "shows nothing when the share sheet is cancelled",
      Object.assign(new Error("cancelado"), { name: "AbortError" }),
      undefined,
    ],
  ])("INV-R9 %s", async (_, failure, notice) => {
    const user = userEvent.setup();
    stubNavigator({ share: vi.fn().mockRejectedValue(failure) });
    const room = renderLobby();

    await user.click(screen.getByRole("button", { name: "Compartir" }));
    await act(async () => {});

    expect(vi.mocked(room.setNotice).mock.calls[0]).toEqual(notice);
  });
});

describe("confirming destructive host actions", () => {
  it("ROOM-R9 only kicks a participant after confirmation", async () => {
    const user = userEvent.setup();
    const confirm = vi.mocked(window.confirm).mockReturnValueOnce(false);
    const room = renderLobby();

    await user.click(screen.getByRole("button", { name: "Expulsar" }));
    expect(room.run).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Expulsar" }));

    expect(confirm).toHaveBeenCalledWith("¿Expulsar a Beto de la sesión?");
    expect(room.run).toHaveBeenCalledExactlyOnceWith("kick", { participant_id: "guest" });
  });

  it.each([
    ["the ranking", false],
    ["the options sheet", true],
  ])("ROOM-R9 only closes voting from %s after confirmation", async (_, fromSheet) => {
    const user = userEvent.setup();
    const confirm = vi.mocked(window.confirm).mockReturnValueOnce(false);
    const room = fakeRoom();
    render(
      fromSheet ? (
        <OptionsMenu room={room} state={votingState} providers={providers} />
      ) : (
        <Results room={room} state={votingState} />
      ),
    );
    const close = async () => {
      if (fromSheet) await user.click(screen.getByRole("button", { name: "Opciones" }));
      await user.click(screen.getByRole("button", { name: "Terminar votación" }));
    };

    await close();
    expect(room.run).not.toHaveBeenCalled();
    await close();

    expect(confirm).toHaveBeenCalledWith(
      "¿Terminar la votación? Ya no se podrán recibir más votos.",
    );
    expect(room.run).toHaveBeenCalledExactlyOnceWith("close");
  });
});

describe("filters", () => {
  const filtersRoute = `POST /api/v1/sessions/${access.session_id}/filters`;

  function renderFilters(room = fakeRoom()) {
    render(<FiltersForm room={room} providers={providers} saved={lobbyState.session.filters} />);
    return room;
  }

  it("FIL-R3 blocks starting while the filters are not saved", () => {
    render(
      <Lobby room={fakeRoom({ filtersPending: true })} state={lobbyState} providers={providers} />,
    );

    expect(screen.getByRole("button", { name: "Iniciar votación" })).toBeDisabled();
  });

  it("FIL-R3 saves the latest valid draft 350 ms after the last edit", async () => {
    const user = withFakeDebounceTimers();
    const api = fakeApi({ [filtersRoute]: () => ({ ok: true }) });
    const room = renderFilters();

    await user.click(screen.getByLabelText("Drama"));
    await user.click(screen.getByLabelText("Netflix"));
    await user.click(screen.getByLabelText("Drama"));
    await user.clear(screen.getByLabelText("Año desde"));
    await user.type(screen.getByLabelText("Año desde"), "01995");
    expect(room.setFiltersPending).toHaveBeenLastCalledWith(true);

    await act(() => vi.advanceTimersByTimeAsync(349));
    expect(api.count(filtersRoute)).toBe(0);
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(api.bodies(filtersRoute)).toEqual([
      { genre_ids: [], provider_ids: [8], min_year: 1995, max_runtime: 150 },
    ]);
    expect(room.setFiltersPending).toHaveBeenLastCalledWith(false);
  });

  it("FIL-R3 does not send a draft outside the limits and explains them", async () => {
    const user = withFakeDebounceTimers();
    const api = fakeApi({ [filtersRoute]: () => ({ ok: true }) });
    renderFilters(fakeRoom({ filtersPending: true }));

    await user.clear(screen.getByLabelText("Duración máxima (min)"));
    await user.type(screen.getByLabelText("Duración máxima (min)"), "601");
    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Completa los números dentro de los límites indicados.",
    );
    expect(api.count(filtersRoute)).toBe(0);
  });

  it("FIL-R3 shows a failed save and sends it again on retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    const api = fakeApi({
      [filtersRoute]: () => (fail ? json({ error: "Sala cerrada" }, 409) : { ok: true }),
    });
    renderFilters();

    await user.click(screen.getByLabelText("Comedia"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se guardaron los filtros: Sala cerrada",
    );

    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(api.count(filtersRoute)).toBe(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("FIL-R6 searches long catalogs and keeps a saved service that left the catalog", async () => {
    const user = userEvent.setup();
    const catalog = {
      ...providers,
      list: Array.from({ length: 12 }, (_, i) => ({
        provider_id: i + 1,
        provider_name: `Plataforma ${i + 1}`,
      })),
      names: {},
    };
    render(
      <FiltersForm
        room={fakeRoom()}
        providers={catalog}
        saved={{ ...lobbyState.session.filters, provider_ids: [500] }}
      />,
    );

    expect(screen.getAllByRole("checkbox", { name: /^Plataforma/ })).toHaveLength(10);
    expect(screen.getByText("Busca para más servicios.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Servicio 500")).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "servicio 5");
    expect(screen.getByLabelText("Servicio 500")).toBeChecked();

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "inexistente");
    expect(screen.getByText("No hay servicios que coincidan.")).toBeInTheDocument();
  });
});

describe("movie card", () => {
  const englishTrailer: Trailer = { key: "abcdefghijk", language: "en-US" };
  const longOverview = `${"Una historia larga ".repeat(12)}con final.`;

  it("TRAILER-R4 flips to an English trailer and a long synopsis, and back to the poster", async () => {
    const user = userEvent.setup();
    render(
      <MovieCard
        movie={movie(1, "Primera", { overview: longOverview })}
        providers={providers}
        trailers={new TrailerCache(async () => englishTrailer)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver sinopsis y tráiler de Primera" }));

    expect(screen.getByTitle("Tráiler de Primera")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/abcdefghijk",
    );
    expect(screen.getByText("Tráiler en inglés")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Leer más" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText(longOverview)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver menos" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Volver al afiche" }));
    expect(
      screen.getByRole("button", { name: "Ver sinopsis y tráiler de Primera" }),
    ).toBeInTheDocument();
  });

  it("TRAILER-R4 says when there is no trailer and no synopsis", async () => {
    const user = userEvent.setup();
    render(
      <MovieCard
        movie={movie(2, "Sin video")}
        providers={providers}
        trailers={new TrailerCache(async () => null)}
      />,
    );

    expect(await screen.findByText("Sinopsis")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver sinopsis y tráiler de Sin video" }));

    expect(
      await screen.findByText("No hay un tráiler disponible para esta película."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin sinopsis disponible.")).toBeInTheDocument();
  });

  it("TRAILER-R4 lets the viewer retry a failed trailer lookup", async () => {
    const user = userEvent.setup();
    let available = false;
    const fetchTrailer = async () => {
      if (!available) throw new Error("TMDB no responde");
      return { key: "abcdefghijk", language: "es-CL" };
    };
    render(
      <MovieCard
        movie={movie(3, "Inestable")}
        providers={providers}
        trailers={new TrailerCache(fetchTrailer)}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ver sinopsis y tráiler de Inestable" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("TMDB no responde");
    available = true;
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTitle("Tráiler de Inestable")).toBeInTheDocument();
    expect(screen.queryByText("Tráiler en inglés")).not.toBeInTheDocument();
  });
});

it("TRAILER-R3 prefetches the current and next trailers with the participant's token", async () => {
  const api = fakeApi({
    "GET /api/v1/sessions/room-1/movies/1/trailer": () => ({ trailer: null }),
    "GET /api/v1/sessions/room-1/movies/2/trailer": () => ({ trailer: null }),
  });
  const queue = new VoteQueue(
    votingState,
    () => sessionStorage,
    () => new Promise(() => {}),
    async () => {},
  );
  render(
    <Voting room={fakeRoom({ voteQueue: queue })} state={votingState} providers={providers} />,
  );

  await waitFor(() => expect(api.calls).toHaveLength(2));
  expect(api.calls).toEqual([
    { route: "GET /api/v1/sessions/room-1/movies/1/trailer", body: undefined, token: access.token },
    { route: "GET /api/v1/sessions/room-1/movies/2/trailer", body: undefined, token: access.token },
  ]);
  queue.dispose();
});

it("RANK-R7 expands the ranking and details who voted for and against a candidate", async () => {
  const user = userEvent.setup();
  const state: State = {
    ...votingState,
    participants: [host, guest],
    movies: Array.from({ length: 6 }, (_, i) => movie(i + 1, `Película ${i + 1}`)),
    votes: [
      { participant_id: host.id, movie_id: 1, liked: true },
      { participant_id: "gone", movie_id: 1, liked: true, participant_name: "Carla" },
      { participant_id: "unknown", movie_id: 1, liked: false },
    ],
  };
  render(<RankingList room={fakeRoom()} state={state} />);

  await user.click(screen.getByRole("button", { name: "Mostrar más" }));
  expect(screen.getByText("Película 6")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mostrar menos" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await user.click(screen.getByText("Película 1"));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Me gusta: Ana, Carla")).toBeInTheDocument();
  expect(within(dialog).getByText("No me gusta: Participante")).toBeInTheDocument();

  await user.click(dialog);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

describe("Gemini curation", () => {
  it.each([
    [30, "Gemini eligió 2 de 30 candidatas según los votos del grupo."],
    [undefined, "Gemini ordenó las películas disponibles según los votos del grupo."],
  ])("AI-R1 explains a Gemini batch drawn from %s candidates", (candidate_count, message) => {
    const state: State = {
      ...votingState,
      session: {
        ...votingState.session,
        batch_curation: {
          method: "affinity",
          summary: "Les gustan los thrillers.",
          analyzed_movies: 4,
          candidate_count,
        },
      },
    };
    render(<Results room={fakeRoom()} state={state} />);

    expect(screen.getByRole("heading", { name: "Selección de Gemini" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByText("Les gustan los thrillers.")).toBeInTheDocument();
  });

  it("AI-R2 shows the group profile once voting has closed", () => {
    const state: State = {
      ...votingState,
      session: { ...votingState.session, status: "closed", group_profile: "Grupo aventurero" },
    };
    render(<Results room={fakeRoom()} state={state} />);

    expect(
      screen.getByRole("heading", { name: "Perfil del grupo con Gemini" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grupo aventurero")).toBeInTheDocument();
  });
});

describe("options sheet", () => {
  it("RANK-R5 gives the host the ranking, a new batch and leaving", async () => {
    const user = userEvent.setup();
    const room = fakeRoom();
    render(<OptionsMenu room={room} state={votingState} providers={providers} />);
    const open = () => user.click(screen.getByRole("button", { name: "Opciones" }));

    await open();
    expect(within(screen.getByRole("dialog")).getByText("Beto")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver ranking" }));
    expect(location.pathname).toBe("/room/room-1/manage");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await open();
    await user.click(screen.getByRole("button", { name: "Agregar películas" }));
    await open();
    await user.click(screen.getByRole("button", { name: "Salir" }));

    expect(room.run).toHaveBeenCalledExactlyOnceWith("next");
    expect(room.leave).toHaveBeenCalledOnce();
  });

  it("RANK-R5 lets a guest on the ranking return to voting without host actions", async () => {
    const user = userEvent.setup();
    render(
      <OptionsMenu
        room={fakeRoom({ results: true })}
        state={{ ...votingState, me: guest }}
        providers={providers}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Opciones" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Ver ranking" })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Agregar películas" }),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Continuar votando" }));

    expect(location.pathname).toBe("/room/room-1");
  });
});
