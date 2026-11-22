// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, json } from "@/test/harness";
import { publishLive, resetLive } from "@/lib/vitals-live";
import type { VitalsSummary } from "@/lib/vitals";
import VitalsPage from "./page";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const row = (overrides: Partial<VitalsSummary["rows"][number]> = {}) => ({
  page: "/",
  device: "celular" as const,
  name: "LCP" as const,
  samples: 24,
  p75: 2100,
  good: 18,
  needs_improvement: 4,
  poor: 2,
  top_element: "html>body>main>img.hero",
  ...overrides,
});

const summary = (overrides: Partial<VitalsSummary> = {}): VitalsSummary => ({
  min_samples: 20,
  release: "",
  rows: [
    row(),
    row({ name: "INP", p75: 320, samples: 3, good: 1, needs_improvement: 1, poor: 1 }),
    row({ name: "CLS", p75: 0.3, top_element: null }),
    row({ device: "escritorio", p75: 4500, page: "/start" }),
  ],
  lcp_parts: [
    {
      page: "/",
      device: "celular",
      samples: 24,
      p75: { ttfb: 300, load_delay: 100, load_duration: 400, render_delay: 50 },
    },
    {
      page: "/start",
      device: "escritorio",
      samples: 1,
      p75: { ttfb: 100, load_delay: 0, load_duration: 0, render_delay: 0 },
    },
  ],
  releases: [
    { release: "abc1234", samples: 20, last_received_at: "2026-11-20T00:00:00Z" },
    { release: "local", samples: 4, last_received_at: "2026-11-19T00:00:00Z" },
  ],
  ...overrides,
});

beforeEach(() => resetLive());
afterEach(() => vi.unstubAllGlobals());

describe("/vitals", () => {
  it("VITALS-F1 shows the mobile percentiles with ratings, shares and the responsible element", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando el resumen");

    const lcp = (await screen.findAllByRole("row")).find((r) =>
      /^\/Nombre\s*LCP/.test(r.textContent!),
    )!;
    expect(lcp).toHaveTextContent("2.100 msBueno");
    expect(lcp).toHaveTextContent("75%");
    expect(lcp).toHaveTextContent("17%");
    expect(lcp).toHaveTextContent("8%");
    expect(lcp).toHaveTextContent("img.hero");
    const cls = screen.getAllByRole("row").find((r) => /CLS/.test(r.textContent!))!;
    expect(cls).toHaveTextContent("0,300Deficiente");
    expect(cls).toHaveTextContent("—");
    expect(screen.queryByText("/start", { selector: "code" })).not.toBeInTheDocument();
  });

  it("VITALS-F2 marks rows with few samples and explains why", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    expect(await screen.findByRole("note")).toHaveTextContent("menos de 20 muestras");
    expect(screen.getAllByLabelText("muestra baja")).toHaveLength(1);
  });

  it("VITALS-F3 shows no warning when every row has enough samples", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary({ rows: [row()] }) });
    render(<VitalsPage />);
    await screen.findByText("2.100 ms", { exact: false });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("VITALS-F4 switches between mobile and desktop", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    await screen.findByRole("note");
    expect(screen.getByRole("button", { name: "Celular" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    expect(screen.getByRole("button", { name: "Escritorio" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("4.500 ms", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("2.100 ms", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByTestId("parts-/start")).toBeInTheDocument();
    expect(screen.queryByTestId("parts-/")).not.toBeInTheDocument();
  });

  it("VITALS-F5 breaks the LCP into its four parts", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    const parts = await screen.findByTestId("parts-/");
    expect(parts).toHaveTextContent("24 muestras");
    expect(within(parts).getByRole("img")).toHaveAccessibleName(
      "Primer byte (TTFB) 300 ms, Retraso de carga 100 ms, Duración de carga 400 ms, Retraso de render 50 ms",
    );
    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    expect(screen.getByTestId("parts-/start")).toHaveTextContent("1 muestra");
  });

  it("VITALS-F6 filters by release and lists the available releases", async () => {
    const api = fakeApi({
      "GET /api/v1/vitals/summary": () => summary(),
      "GET /api/v1/vitals/summary?release=abc1234": () =>
        summary({ rows: [row({ p75: 1000 })], release: "abc1234" }),
    });
    render(<VitalsPage />);
    const select = await screen.findByLabelText("Versión");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Todas", "abc1234 (20)", "local (4)"]);
    fireEvent.change(select, { target: { value: "abc1234" } });
    expect(await screen.findByText("1.000 ms", { exact: false })).toBeInTheDocument();
    expect(api.count("GET /api/v1/vitals/summary?release=abc1234")).toBe(1);
  });

  it("VITALS-F7 explains when there are no samples for the chosen device and release", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary({ rows: [], lcp_parts: [] }) });
    render(<VitalsPage />);
    expect(await screen.findByText(/Aún no hay muestras de celular/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escritorio" }));
    expect(screen.getByText(/Aún no hay muestras de escritorio/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("VITALS-F7 mentions the release when the empty state comes from a filter", async () => {
    fakeApi({
      "GET /api/v1/vitals/summary": () => summary(),
      "GET /api/v1/vitals/summary?release=local": () => summary({ rows: [], lcp_parts: [] }),
    });
    render(<VitalsPage />);
    fireEvent.change(await screen.findByLabelText("Versión"), { target: { value: "local" } });
    expect(await screen.findByText(/en la versión local/)).toBeInTheDocument();
  });

  it("VITALS-F8 shows the server error and retries", async () => {
    let ok = false;
    const api = fakeApi({
      "GET /api/v1/vitals/summary": () =>
        ok ? summary() : json({ error: "Servicio no disponible" }, 503),
    });
    render(<VitalsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    ok = true;
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.count("GET /api/v1/vitals/summary")).toBe(2);
  });

  it("VITALS-F8 shows a connection message when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<VitalsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo conectar");
  });

  it("VITALS-F9 shows this visit live, with element, parts and thresholds", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    const lcp = screen.getByTestId("live-LCP");
    expect(lcp).toHaveTextContent("…");
    expect(lcp).toHaveTextContent("Esperando el elemento más grande");
    expect(screen.getByTestId("live-INP")).toHaveTextContent("Aparece al interactuar");
    expect(lcp).toHaveTextContent("bueno ≤ 2.500 ms, deficiente > 4.000 ms");

    act(() =>
      publishLive("LCP", {
        value: 3000,
        rating: "needs-improvement",
        target: "html>body>main>h1",
        parts: { timeToFirstByte: 10, resourceLoadDelay: 20, elementRenderDelay: 30 },
      }),
    );
    expect(lcp).toHaveTextContent("3.000 msMejorable");
    expect(lcp).toHaveTextContent("Elemento: h1");
    expect(lcp).toHaveTextContent(
      "TTFB 10 ms · retraso de carga 20 ms · duración de carga 0 ms · retraso de render 30 ms",
    );

    act(() => publishLive("CLS", { value: 0, rating: "good", target: null }));
    expect(screen.getByTestId("live-CLS")).toHaveTextContent("Ningún elemento responsable.");
    await screen.findByRole("table");
  });

  it("VITALS-F10 explains how to read the results and links the sources", async () => {
    fakeApi({ "GET /api/v1/vitals/summary": () => summary() });
    render(<VitalsPage />);
    expect(screen.getByRole("heading", { name: "Cómo leer estos resultados" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Qué es el p75" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Web Vitals" });
    expect(link).toHaveAttribute("href", "https://web.dev/articles/vitals");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await screen.findByRole("table");
  });
});
