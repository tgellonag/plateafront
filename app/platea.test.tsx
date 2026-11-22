// @vitest-environment jsdom
import { useContext } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  FakeSocket,
  access,
  fakeApi,
  guest,
  host,
  json,
  lobbyState,
  renderAt,
  setupBrowserFakes,
  votingState,
} from "@/test/harness";
import { navigationHooks } from "@/test/navigation";
import { Platea } from "./platea";
import Room from "./room/[id]/page";
import { RoomContext } from "./use-room";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  ...navigationHooks,
}));

setupBrowserFakes();

const roomPath = "/api/v1/sessions/room-1";
const noProviders = { "GET /api/v1/providers": () => ({ providers: [], stale: false }) };
const resumes = { [`POST ${roomPath}/resume`]: () => ({ ok: true }) };

function saveAccess() {
  sessionStorage.setItem("platea-room-1", JSON.stringify(access));
}

describe("restoring access", () => {
  it("INV-R6 restores the room in the URL after the server accepts the saved access", async () => {
    saveAccess();
    const api = fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => ({ ...lobbyState, me: guest, invitation: null }),
    });
    renderAt("/room/room-1", <Room />);

    expect(
      await screen.findByText("Esperando que el anfitrión inicie la votación."),
    ).toBeInTheDocument();
    expect(api.calls[0]).toMatchObject({ route: `POST ${roomPath}/resume`, token: access.token });
  });

  it("INV-R6 falls back to the name step when the room has no saved access", async () => {
    const api = fakeApi(noProviders);
    renderAt("/room/room-1", <Room />);

    expect(await screen.findByText("¿Cómo te llamas?")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(api.count(`POST ${roomPath}/resume`)).toBe(0);
  });

  it("INV-R11 shows why restoring failed and resumes the recent access on retry", async () => {
    saveAccess();
    sessionStorage.setItem("platea-recent", JSON.stringify(access));
    let resumable = false;
    fakeApi({
      ...noProviders,
      [`POST ${roomPath}/resume`]: () =>
        resumable ? { ok: true } : json({ error: "La sala no responde" }, 503),
      [`GET ${roomPath}`]: () => lobbyState,
    });
    renderAt("/room/room-1", <Platea />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("La sala no responde");

    resumable = true;
    const retry = within(alert).getByRole("button", { name: "Reintentar" });
    await waitFor(() => expect(retry).toBeEnabled());
    await userEvent.click(retry);

    expect(await screen.findByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("INV-R11 never restores a saved access from an invitation link", async () => {
    saveAccess();
    sessionStorage.setItem("platea-last", "room-1");
    const api = fakeApi(noProviders);
    renderAt("/join/ABC234", <Platea />);

    expect(await screen.findByText("¿Cómo te llamas?")).toBeInTheDocument();
    expect(api.count(`POST ${roomPath}/resume`)).toBe(0);
  });
});

describe("room actions", () => {
  it("ROOM-R10 keeps the room after a rejected action and invalidates access on a 401 refresh", async () => {
    saveAccess();
    let revoked = false;
    fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => (revoked ? json({ error: "Sin acceso" }, 401) : lobbyState),
      [`POST ${roomPath}/start`]: () => json({ error: "No hay películas" }, 409),
    });
    renderAt("/room/room-1", <Platea />);

    await userEvent.click(await screen.findByRole("button", { name: "Iniciar votación" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No hay películas");
    expect(screen.getByRole("heading", { name: "Sala" })).toBeInTheDocument();

    revoked = true;
    await userEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Tu acceso a la sala ya no está activo"),
    );
    expect(screen.queryByRole("heading", { name: "Sala" })).not.toBeInTheDocument();
  });

  it("VOTE-R3 warns when the browser cannot store access or votes and retries from the warning", async () => {
    saveAccess();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const api = fakeApi({ ...noProviders, ...resumes, [`GET ${roomPath}`]: () => votingState });
    renderAt("/room/room-1", <Platea />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "El navegador no permite guardar tu acceso",
    );
    const reads = api.count(`GET ${roomPath}`);
    await userEvent.click(
      await screen.findByRole("button", { name: "Sin conexión. Reintentar envío de votos" }),
    );

    await waitFor(() => expect(api.count(`GET ${roomPath}`)).toBeGreaterThan(reads));
  });
});

describe("leaving", () => {
  it("ROOM-R11 asks before leaving with a pending vote and warns before closing the tab", async () => {
    saveAccess();
    const api = fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => votingState,
      [`POST ${roomPath}/vote`]: () => new Promise(() => {}),
      [`POST ${roomPath}/leave`]: () => ({ ok: true }),
    });
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    renderAt("/room/room-1", <Platea />);

    await userEvent.click(await screen.findByRole("button", { name: "Me gusta" }));
    expect(await screen.findByRole("heading", { name: "Segunda" })).toBeInTheDocument();

    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const leave = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Opciones" }));
      await userEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Salir" }),
      );
    };
    await leave();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Hay votos sin confirmar"));
    expect(api.count(`POST ${roomPath}/leave`)).toBe(0);

    confirm.mockReturnValue(true);
    await leave();

    await waitFor(() => expect(location.pathname).toBe("/"));
    expect(api.count(`POST ${roomPath}/leave`)).toBe(1);
  });

  it("ROOM-R11 returns home and remembers the access when leaving a revoked room", async () => {
    saveAccess();
    fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => lobbyState,
      [`POST ${roomPath}/leave`]: () => json({ error: "Sin acceso" }, 401),
    });
    renderAt("/room/room-1", <Platea />);
    await screen.findByRole("heading", { name: "Sala" });

    act(() => FakeSocket.latest.onclose!({ code: 1008 }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tu acceso a la sala ya no está activo");
    await userEvent.click(within(alert).getByRole("button", { name: "Salir" }));

    expect(await screen.findByText("¿Cómo te llamas?")).toBeInTheDocument();
    expect(location.pathname).toBe("/");
    expect(sessionStorage.getItem("platea-last")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("platea-recent")!)).toEqual(access);
  });

  it("ROOM-R11 stays in the room when leaving fails for another reason", async () => {
    saveAccess();
    const api = fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => lobbyState,
      [`POST ${roomPath}/leave`]: () => json({ error: "Servidor caído" }, 500),
    });
    renderAt("/room/room-1", <Platea />);
    const leave = await screen.findByRole("button", { name: "Salir" });
    await waitFor(() => expect(leave).toBeEnabled());

    await userEvent.click(leave);

    await waitFor(() => expect(api.count(`POST ${roomPath}/leave`)).toBe(1));
    expect(screen.getByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(location.pathname).toBe("/room/room-1");
  });
});

describe("switching rooms", () => {
  function CreateRoom() {
    const room = useContext(RoomContext)!;
    return (
      <button onClick={() => void room.enter(true, { name: "Ana", code: "", isTest: false })}>
        Crear otra sala
      </button>
    );
  }

  it("RT-R6 ignores a slow refresh from a room the participant already left", async () => {
    saveAccess();
    const secondRoom = { session_id: "room-2", token: "b".repeat(64) };
    let answerSlowRefresh: (reply: Response) => void = () => {};
    let firstRoomReads = 0;
    fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () =>
        ++firstRoomReads === 1
          ? { ...lobbyState, invitation: { code: "OLD234", expires_at: "2099-01-01T00:00:00Z" } }
          : new Promise((resolve) => (answerSlowRefresh = resolve)),
      [`POST ${roomPath}/leave`]: () => ({ ok: true }),
      "POST /api/v1/sessions": () => secondRoom,
      "GET /api/v1/sessions/room-2": () => ({
        ...lobbyState,
        session: { ...lobbyState.session, id: "room-2" },
        invitation: { code: "NEW234", expires_at: "2099-01-01T00:00:00Z" },
      }),
    });
    renderAt("/room/room-1", <Platea>{<CreateRoom />}</Platea>);
    await screen.findByText("OLD234");
    await waitFor(() => expect(firstRoomReads).toBe(2));

    const leave = screen.getByRole("button", { name: "Salir" });
    await waitFor(() => expect(leave).toBeEnabled());
    await userEvent.click(leave);
    await userEvent.click(await screen.findByRole("button", { name: "Crear otra sala" }));
    expect(await screen.findByText("NEW234")).toBeInTheDocument();

    await act(async () =>
      answerSlowRefresh(
        json({ ...lobbyState, invitation: { code: "OLD234", expires_at: "2099-01-01T00:00:00Z" } }),
      ),
    );

    expect(screen.getByText("NEW234")).toBeInTheDocument();
    expect(screen.queryByText("OLD234")).not.toBeInTheDocument();
  });
});

describe("ranking route", () => {
  it("RANK-R6 moves a participant who voted every movie to the ranking route", async () => {
    saveAccess();
    fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => ({
        ...votingState,
        votes: [
          { participant_id: host.id, movie_id: 1, liked: true },
          { participant_id: host.id, movie_id: 2, liked: false },
        ],
      }),
    });
    renderAt("/room/room-1", <Platea />);

    expect(await screen.findByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    expect(screen.getByText("Ya votaste todas las películas disponibles.")).toBeInTheDocument();
    expect(location.pathname).toBe("/room/room-1/manage");
  });

  it("RANK-R6 sends the ranking route back to the room before voting starts", async () => {
    saveAccess();
    fakeApi({ ...noProviders, ...resumes, [`GET ${roomPath}`]: () => lobbyState });
    renderAt("/room/room-1/manage", <Platea />);

    expect(await screen.findByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(location.pathname).toBe("/room/room-1");
  });

  it("RANK-R5 lets a guest on the ranking route go back to voting", async () => {
    saveAccess();
    fakeApi({
      ...noProviders,
      ...resumes,
      [`GET ${roomPath}`]: () => ({ ...votingState, me: guest }),
    });
    renderAt("/room/room-1/manage", <Platea />);

    expect(await screen.findByRole("heading", { name: "Ranking" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar votando" }));

    expect(location.pathname).toBe("/room/room-1");
  });
});

it("FIL-R5 lets the host retry loading streaming services", async () => {
  saveAccess();
  let available = false;
  fakeApi({
    "GET /api/v1/providers": () =>
      available
        ? { providers: [{ provider_id: 337, provider_name: "Disney Plus" }], stale: true }
        : json({ error: "Catálogo no disponible" }, 503),
    ...resumes,
    [`GET ${roomPath}`]: () => lobbyState,
  });
  renderAt("/room/room-1", <Platea />);

  expect(await screen.findByText("Catálogo no disponible")).toBeInTheDocument();
  available = true;
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  expect(await screen.findByText("Disney Plus")).toBeInTheDocument();
  expect(screen.getByText("Lista guardada; puede haber cambiado.")).toBeInTheDocument();
});
