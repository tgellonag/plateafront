import { describe, expect, it, vi } from "vitest";
import { CORE_VITALS as appCore, THRESHOLDS as appThresholds } from "../lib/vitals";
import {
  CORE_VITALS,
  THRESHOLDS,
  analyze,
  fetchSummary,
  rate,
  renderIssue,
  renderReport,
} from "./vitals-report.mjs";

const row = (over) => ({
  page: "/",
  device: "celular",
  name: "LCP",
  samples: 30,
  p75: 1000,
  good: 30,
  needs_improvement: 0,
  poor: 0,
  top_element: "img.hero",
  ...over,
});
const summary = (rows) => ({ min_samples: 20, release: "", rows });
const date = new Date("2026-11-23T12:00:00Z");

describe("umbrales", () => {
  it("coinciden con los de lib/vitals.ts", () => {
    expect(THRESHOLDS).toEqual(appThresholds);
    expect(CORE_VITALS).toEqual([...appCore]);
  });

  it("califican como web.dev: el límite es bueno y el siguiente tramo mejorable", () => {
    expect(rate("LCP", 2500)).toBe("good");
    expect(rate("LCP", 2501)).toBe("needs-improvement");
    expect(rate("LCP", 4001)).toBe("poor");
    expect(rate("CLS", 0.1)).toBe("good");
    expect(rate("INP", 501)).toBe("poor");
  });
});

describe("analyze", () => {
  it("es insuficiente mientras ninguna métrica principal tenga las muestras mínimas", () => {
    const result = analyze(
      summary([row({ samples: 5, p75: 9000 }), row({ name: "TTFB", p75: 5000 })]),
    );
    expect(result.status).toBe("insufficient");
    expect(result.problems).toEqual([]);
  });

  it("es ok si lo evaluable está en bueno, aunque haya filas sin muestras", () => {
    const result = analyze(summary([row(), row({ page: "/x", samples: 3, p75: 9000 })]));
    expect(result.status).toBe("ok");
  });

  it("detecta problemas solo en LCP, INP o CLS con muestras suficientes", () => {
    const result = analyze(
      summary([
        row({ name: "INP", p75: 350 }),
        row({ name: "CLS", p75: 0.3 }),
        row({ name: "FCP", p75: 9000 }),
        row({ name: "LCP", samples: 19, p75: 9000 }),
      ]),
    );
    expect(result.status).toBe("problems");
    expect(result.problems.map((p) => [p.name, p.rating])).toEqual([
      ["INP", "needs-improvement"],
      ["CLS", "poor"],
    ]);
  });
});

describe("textos", () => {
  const options = { release: "abc1234", date, runUrl: "https://github.com/o/r/actions/runs/1" };

  it("el reporte marca los datos insuficientes y enlaza el run", () => {
    const text = renderReport(analyze(summary([row({ samples: 4, p75: 1234.4 })])), options);
    expect(text).toContain("versión `abc1234`");
    expect(text).toContain(
      "| `/` | celular | LCP | 1.234 ms | Datos insuficientes (4 de 20) | 4 |",
    );
    expect(text).toContain("[Ver el run](https://github.com/o/r/actions/runs/1)");
  });

  it("el issue lista solo los problemas, con el elemento responsable", () => {
    const text = renderIssue(
      analyze(summary([row({ p75: 3000 }), row({ page: "/ok", p75: 1000 })])),
      options,
    );
    expect(text).toContain("| `/` | celular | LCP | 3.000 ms | Mejorable | 30 | `img.hero` |");
    expect(text).not.toContain("/ok");
  });
});

describe("fetchSummary", () => {
  it("reintenta cuando el backend aún está despertando", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ rows: [] }) });
    const data = await fetchSummary("https://api.test", "d60fa09", { wait: 0, fetchFn });
    expect(data).toEqual({ rows: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.test/api/v1/vitals/summary?release=d60fa09");
  });

  it("falla con un mensaje claro si nunca responde", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("red caída"));
    await expect(
      fetchSummary("https://api.test", "", { attempts: 2, wait: 0, fetchFn }),
    ).rejects.toThrow("No se pudo leer el resumen de https://api.test: red caída");
  });
});
