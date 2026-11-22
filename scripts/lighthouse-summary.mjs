// Resumen de Lighthouse CI para el Job Summary de GitHub Actions: la ejecución mediana de cada ruta
// y los avisos de umbral. Lee lo que `lhci` dejó en .lighthouseci. Uso: node scripts/lighthouse-summary.mjs
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ms = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const cls = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const readJSON = (file) => JSON.parse(readFileSync(file, "utf8"));
const route = (url) => new URL(url).pathname;

export function summarize(manifest, readReport, assertions) {
  const rows = manifest
    .filter((run) => run.isRepresentativeRun)
    .map((run) => {
      const { audits } = readReport(run.jsonPath);
      return {
        route: route(run.url),
        performance: Math.round(run.summary.performance * 100),
        lcp: audits["largest-contentful-paint"].numericValue,
        cls: audits["cumulative-layout-shift"].numericValue,
        tbt: audits["total-blocking-time"].numericValue,
        fcp: audits["first-contentful-paint"].numericValue,
      };
    });
  const warnings = assertions.map((a) => ({
    route: route(a.url),
    audit: a.auditId,
    actual: a.actual,
    expected: a.expected,
    level: a.level,
  }));
  return { rows, warnings };
}

export function render({ rows, warnings }) {
  const lines = ["## Lighthouse CI", ""];
  if (rows.length === 0) return [...lines, "No se generaron reportes.", ""].join("\n");
  lines.push(
    "Mediana de 3 corridas, con emulación de celular. Es una prueba de laboratorio: no mide INP.",
    "",
    "| Ruta | Performance | LCP | CLS | TBT | FCP |",
    "|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| \`${r.route}\` | ${r.performance} | ${ms.format(r.lcp)} ms | ${cls.format(r.cls)} | ` +
        `${ms.format(r.tbt)} ms | ${ms.format(r.fcp)} ms |`,
    ),
    "",
  );
  if (warnings.length === 0) lines.push("Ningún umbral superado.", "");
  else
    lines.push(
      "### Umbrales superados",
      "",
      ...warnings.map(
        (w) => `- \`${w.route}\` · ${w.audit}: ${format(w.actual)} (límite ${format(w.expected)})`,
      ),
      "",
    );
  return lines.join("\n");
}

const format = (value) =>
  typeof value === "number" ? String(Math.round(value * 1000) / 1000) : "—";

function main(dir = ".lighthouseci") {
  const manifestFile = path.join(dir, "manifest.json");
  const assertionsFile = path.join(dir, "assertion-results.json");
  const manifest = existsSync(manifestFile) ? readJSON(manifestFile) : [];
  const assertions = existsSync(assertionsFile) ? readJSON(assertionsFile) : [];
  const text = render(summarize(manifest, readJSON, assertions));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  else console.log(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
