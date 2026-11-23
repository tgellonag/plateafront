import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { describe, expect, it } from "vitest";
import MetricsPage from "./metrics/page";
import { Platea } from "./platea";
import { WelcomeName } from "./screens/welcome-name";
import { WelcomeSession } from "./screens/welcome-session";
import { RoomContext, useRoom } from "./use-room";
import { WelcomeDraftProvider } from "./welcome-draft";

function SessionEntry() {
  const room = useRoom();
  return (
    <RoomContext value={room}>
      <WelcomeDraftProvider>
        <WelcomeSession />
      </WelcomeDraftProvider>
    </RoomContext>
  );
}

const entryRouter = {
  back() {},
  forward() {},
  push() {},
  replace() {},
  refresh() {},
  hmrRefresh() {},
  prefetch() {},
  bfcacheId: "entry",
};

describe("session entry", () => {
  it("INV-R8 keeps the startup screen busy before showing the entry form", () => {
    const html = renderToStaticMarkup(
      <AppRouterContext value={entryRouter}>
        <PathnameContext value="/room/room-1/manage">
          <Platea>
            <p>Formulario de ingreso</p>
          </Platea>
        </PathnameContext>
      </AppRouterContext>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Formulario de ingreso");
    expect(html).not.toContain("<h1>Ranking</h1>");
  });

  it("INV-R8 labels the name field and disables continuing from an empty draft", () => {
    const html = renderToStaticMarkup(
      <AppRouterContext value={entryRouter}>
        <PathnameContext value="/">
          <WelcomeDraftProvider>
            <WelcomeName />
          </WelcomeDraftProvider>
        </PathnameContext>
      </AppRouterContext>,
    );

    expect(html).toContain("Tu nombre");
    expect(html).toContain('maxLength="30"');
    expect(html).toMatch(/<button\b[^>]*disabled=""[^>]*>Continuar/);
  });

  it("LEGAL-R1 shows the TMDB logo and notice on the welcome screen", () => {
    const html = renderToStaticMarkup(
      <AppRouterContext value={entryRouter}>
        <PathnameContext value="/">
          <WelcomeDraftProvider>
            <WelcomeName />
          </WelcomeDraftProvider>
        </PathnameContext>
      </AppRouterContext>,
    );

    expect(html).toContain('href="https://www.themoviedb.org/"');
    expect(html).toContain('alt="The Movie Database (TMDB)"');
    expect(html).toContain(
      "Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.",
    );
  });

  it.each([
    ["/start", "/"],
    ["/join/abc234/start", "/join/abc234"],
  ])("INV-R8 redirects %s to %s when there is no name", (from, to) => {
    const render = () =>
      renderToStaticMarkup(
        <AppRouterContext value={entryRouter}>
          <PathnameContext value={from}>
            <SessionEntry />
          </PathnameContext>
        </AppRouterContext>,
      );

    expect(render).toThrow(expect.objectContaining({ digest: `NEXT_REDIRECT;replace;${to};307;` }));
  });
});

it("MET-R3 requests a private admin token before displaying metrics", () => {
  const html = renderToStaticMarkup(<MetricsPage />);

  expect(html).toContain("Token de administración");
  expect(html).toMatch(/<input\b[^>]*type="password"[^>]*required=""/);
  expect(html).toContain("Consultar");
  expect(html).not.toContain("Tasa de decisión en 15 minutos:");
});
