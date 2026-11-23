// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { access, fakeApi, json, lobbyState, renderAt, setupBrowserFakes } from "@/test/harness";
import { navigation, navigationHooks } from "@/test/navigation";
import JoinStart from "./join/[code]/start/page";
import MetricsPage from "./metrics/page";
import { WelcomeName } from "./screens/welcome-name";
import Start from "./start/page";
import { useWelcomeDraft } from "./welcome-draft";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  ...navigationHooks,
}));

setupBrowserFakes();

const noProviders = { "GET /api/v1/providers": () => ({ providers: [], stale: false }) };

function AfterNameStep({ children }: { children: ReactNode }) {
  const [draft] = useWelcomeDraft();
  const [named, setNamed] = useState(false);
  if (draft.name && !named) setNamed(true);
  return named ? children : <WelcomeName />;
}

async function enterName(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByPlaceholderText("Nombre"));
  await user.paste(name);
}

describe("name step", () => {
  it("rejects a name made only of invisible characters without blocking Unicode names", async () => {
    const user = userEvent.setup();
    renderAt("/", <WelcomeName />);
    const submit = screen.getByRole("button", { name: "Continuar" });

    await enterName(user, " \u200b\u200d\ufe0f\u2060 ");
    expect(submit).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(navigation.router.push).not.toHaveBeenCalled();

    await user.clear(screen.getByPlaceholderText("Nombre"));
    await enterName(user, " Zoë 李🎬 ");
    await user.click(submit);
    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith("/start");
    expect(screen.getByPlaceholderText("Nombre")).toHaveValue("Zoë 李🎬");
  });

  it.each([
    ["/", "/start"],
    ["/join/abc234", "/join/abc234/start"],
  ])("INV-R10 continues from %s to %s with the trimmed name", async (path, next) => {
    const user = userEvent.setup();
    renderAt(path, <WelcomeName />);
    const submit = screen.getByRole("button", { name: "Continuar" });

    await user.type(screen.getByPlaceholderText("Nombre"), "   ");
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText("Nombre"), "Ana  {Enter}");

    expect(navigation.router.push).toHaveBeenCalledExactlyOnceWith(next);
    expect(screen.getByPlaceholderText("Nombre")).toHaveValue("Ana");
  });
});

describe("session step", () => {
  it("INV-R10 joins with the invitation code from the link in uppercase", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      ...noProviders,
      "POST /api/v1/join": () => access,
      "GET /api/v1/sessions/room-1": () => lobbyState,
    });
    renderAt(
      "/join/abc234/start",
      <AfterNameStep>
        <JoinStart />
      </AfterNameStep>,
    );
    await enterName(user, "Ana");

    expect(await screen.findByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    expect(screen.getByLabelText("Código de invitación")).toHaveValue("ABC234");
    await user.click(screen.getByRole("button", { name: "Unirse" }));

    expect(await screen.findByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(api.bodies("POST /api/v1/join")).toEqual([{ name: "Ana", code: "ABC234", tokens: [] }]);
    expect(navigation.router.replace).toHaveBeenCalledExactlyOnceWith("/room/room-1");
    expect(navigation.router.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("platea-room-1")).toBe(JSON.stringify(access));
  });

  it("INV-R10 shows why entry failed and keeps the typed code", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      ...noProviders,
      "POST /api/v1/join": ({ code }: { code: string }) =>
        code === "ABC234" ? access : json({ error: "Código vencido" }, 404),
      "GET /api/v1/sessions/room-1": () => lobbyState,
    });
    renderAt(
      "/start",
      <AfterNameStep>
        <Start />
      </AfterNameStep>,
    );
    await enterName(user, "Ana");
    const join = await screen.findByRole("button", { name: "Unirse" });
    expect(join).toBeDisabled();

    await user.type(screen.getByLabelText("Código de invitación"), "xyz789");
    await user.click(join);

    expect(await screen.findByRole("alert")).toHaveTextContent("Código vencido");
    expect(screen.getByRole("heading", { name: "Hola, Ana" })).toBeInTheDocument();
    const code = screen.getByLabelText("Código de invitación");
    expect(code).toHaveValue("XYZ789");
    await user.clear(code);
    await user.paste(" abc234 ");
    expect(code).toHaveValue("ABC234");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(join);
    expect(await screen.findByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(api.count("POST /api/v1/join")).toBe(2);
  });

  it("INV-R10 shows which action is connecting and does not send it twice", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ ...noProviders, "POST /api/v1/sessions": () => new Promise(() => {}) });
    renderAt(
      "/start",
      <AfterNameStep>
        <Start />
      </AfterNameStep>,
    );
    await enterName(user, "Ana");

    await user.click(await screen.findByRole("button", { name: "Crear sesión" }));
    const connecting = await screen.findByRole("button", { name: "Conectando…" });
    await user.click(connecting);

    expect(connecting).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unirse" })).toBeDisabled();
    expect(api.count("POST /api/v1/sessions")).toBe(1);
  });

  it("creates a regular session without showing demo options", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      ...noProviders,
      "POST /api/v1/sessions": () => access,
      "GET /api/v1/sessions/room-1": () => lobbyState,
    });
    renderAt(
      "/start",
      <AfterNameStep>
        <Start />
      </AfterNameStep>,
    );
    await enterName(user, "Ana");

    const create = await screen.findByRole("button", { name: "Crear sesión" });
    expect(screen.queryByText("Opciones")).not.toBeInTheDocument();
    await user.click(create);

    expect(await screen.findByRole("heading", { name: "Sala" })).toBeInTheDocument();
    expect(api.bodies("POST /api/v1/sessions")).toEqual([{ name: "Ana" }]);
  });
});

describe("metrics page", () => {
  async function query(token: string) {
    const user = userEvent.setup();
    render(<MetricsPage />);
    await user.type(screen.getByLabelText("Token de administración"), token);
    await user.click(screen.getByRole("button", { name: "Consultar" }));
  }

  it("MET-R4 displays the metrics for an accepted token", async () => {
    const api = fakeApi({
      "GET /api/v1/metrics": () => ({
        created: 10,
        started: 8,
        closed: 6,
        confirmed: 5,
        within_15_minutes: 4,
        decision_rate: 40,
        median_seconds: null,
        votes: 120,
      }),
    });

    await query("secreto");

    expect(
      await screen.findByRole("heading", { name: "Tasa de decisión en 15 minutos: 40.0%" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sin elecciones")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(api.calls[0].token).toBe("secreto");
  });

  it("MET-R4 shows the error and no results for a rejected token", async () => {
    fakeApi({ "GET /api/v1/metrics": () => json({ error: "Token inválido" }, 401) });

    await query("malo");

    expect(await screen.findByRole("alert")).toHaveTextContent("Token inválido");
    await waitFor(() => expect(screen.getByRole("button", { name: "Consultar" })).toBeEnabled());
    expect(screen.queryByText(/Tasa de decisión/)).not.toBeInTheDocument();
  });
});
