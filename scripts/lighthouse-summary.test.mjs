import { describe, expect, it } from "vitest";
import { render, summarize } from "./lighthouse-summary.mjs";

const report = (lcp, cls, tbt, fcp) => ({
  audits: {
    "largest-contentful-paint": { numericValue: lcp },
    "cumulative-layout-shift": { numericValue: cls },
    "total-blocking-time": { numericValue: tbt },
    "first-contentful-paint": { numericValue: fcp },
  },
});

const manifest = [
  { url: "http://localhost:3000/", isRepresentativeRun: false, jsonPath: "a", summary: {} },
  {
    url: "http://localhost:3000/",
    isRepresentativeRun: true,
    jsonPath: "b",
    summary: { performance: 0.974 },
  },
];

describe("resumen de Lighthouse CI", () => {
  it("toma solo la corrida mediana de cada ruta", () => {
    const reports = { b: report(772.4, 0, 195.2, 770) };
    const { rows, warnings } = summarize(manifest, (file) => reports[file], []);
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      { route: "/", performance: 97, lcp: 772.4, cls: 0, tbt: 195.2, fcp: 770 },
    ]);
  });

  it("muestra la tabla y dice cuando no se superó ningún umbral", () => {
    const text = render({
      rows: [{ route: "/", performance: 97, lcp: 772.4, cls: 0, tbt: 195.2, fcp: 770 }],
      warnings: [],
    });
    expect(text).toContain("| `/` | 97 | 772 ms | 0,000 | 195 ms | 770 ms |");
    expect(text).toContain("Ningún umbral superado.");
  });

  it("lista los umbrales superados", () => {
    const { warnings } = summarize(manifest, () => report(1, 0, 1, 1), [
      {
        url: "http://localhost:3000/",
        auditId: "largest-contentful-paint",
        actual: 3051.9,
        expected: 2500,
        level: "warn",
      },
    ]);
    const text = render({ rows: [], warnings });
    expect(text).toContain("No se generaron reportes.");
    expect(
      render({
        rows: [{ route: "/", performance: 90, lcp: 1, cls: 0, tbt: 1, fcp: 1 }],
        warnings,
      }),
    ).toContain("`/` · largest-contentful-paint: 3051.9 (límite 2500)");
  });
});
