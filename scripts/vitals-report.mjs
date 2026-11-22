// Reporte diario de Core Web Vitals reales: consulta el resumen del backend (el mismo que muestra /vitals),
// lo escribe en el Job Summary de GitHub Actions y deja listo el cuerpo de un issue si algún p75 de
// LCP, INP o CLS con muestras suficientes queda fuera de «bueno». Lo usa .github/workflows/vitals-report.yml.
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Mismos umbrales que lib/vitals.ts, web.dev y el backend: [bueno hasta, malo desde].
// scripts/vitals-report.test.mjs comprueba que no se desincronicen con lib/vitals.ts.
export const THRESHOLDS = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};
export const CORE_VITALS = ["LCP", "INP", "CLS"];
const ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];
const LABEL = { good: "Bueno", "needs-improvement": "Mejorable", poor: "Deficiente" };

export function rate(name, value) {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return "good";
  return value <= poor ? "needs-improvement" : "poor";
}

const ms = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const cls = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const format = (name, value) => (name === "CLS" ? cls.format(value) : `${ms.format(value)} ms`);

// Separa las filas con muestras suficientes de las que todavía no se pueden evaluar.
export function analyze(summary) {
  const rows = [...summary.rows]
    .sort(
      (a, b) =>
        a.page.localeCompare(b.page) ||
        a.device.localeCompare(b.device) ||
        ORDER.indexOf(a.name) - ORDER.indexOf(b.name),
    )
    .map((row) => ({
      ...row,
      enough: row.samples >= summary.min_samples,
      rating: rate(row.name, row.p75),
    }));
  const evaluable = rows.filter((row) => row.enough && CORE_VITALS.includes(row.name));
  const problems = evaluable.filter((row) => row.rating !== "good");
  const status = problems.length > 0 ? "problems" : evaluable.length > 0 ? "ok" : "insufficient";
  return { rows, problems, status, minSamples: summary.min_samples };
}

const cell = (row, minSamples) =>
  row.enough ? LABEL[row.rating] : `Datos insuficientes (${row.samples} de ${minSamples})`;

const table = (rows, minSamples, withElement = false) => [
  `| Pantalla | Dispositivo | Métrica | p75 | Calificación | Muestras |${withElement ? " Elemento |" : ""}`,
  `|---|---|---|---|---|---|${withElement ? "---|" : ""}`,
  ...rows.map(
    (row) =>
      `| \`${row.page}\` | ${row.device} | ${row.name} | ${format(row.name, row.p75)} | ` +
      `${cell(row, minSamples)} | ${row.samples} |` +
      (withElement ? ` ${row.top_element ? `\`${row.top_element}\`` : "—"} |` : ""),
  ),
];

const scope = (release, date) =>
  `${date.toISOString().slice(0, 10)} · ${release ? `versión \`${release}\`` : "todas las versiones"}`;

export function renderReport(analysis, { release = "", date = new Date(), runUrl = "" } = {}) {
  const { rows, problems, status, minSamples } = analysis;
  const headline = {
    problems: `**${problems.length} medición(es) fuera de «bueno».**`,
    ok: "Todas las mediciones con muestras suficientes están en «bueno».",
    insufficient: `Todavía no hay filas con las ${minSamples} muestras que se necesitan para evaluar.`,
  }[status];
  return [
    "## Core Web Vitals de usuarios reales",
    "",
    `${scope(release, date)} · p75 por pantalla y dispositivo (mínimo ${minSamples} muestras).`,
    "",
    headline,
    "",
    ...(rows.length > 0 ? table(rows, minSamples) : ["Aún no hay mediciones."]),
    "",
    "Solo LCP, INP y CLS con muestras suficientes pueden abrir un issue; FCP y TTFB son informativos.",
    ...(runUrl ? ["", `[Ver el run](${runUrl})`] : []),
    "",
  ].join("\n");
}

export function renderIssue(analysis, { release = "", date = new Date(), runUrl = "" } = {}) {
  const { problems, minSamples } = analysis;
  return [
    "Estas mediciones de usuarios reales tienen un p75 fuera de «bueno» (LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1).",
    "",
    ...table(problems, minSamples, true),
    "",
    `Actualizado el ${scope(release, date)}.${runUrl ? ` [Ver el run](${runUrl}).` : ""}`,
    "",
    "Este issue lo mantiene el workflow `Monitoreo · Core Web Vitals`: se actualiza solo y se cierra cuando todo vuelve a «bueno».",
    "",
  ].join("\n");
}

const sleep = (time) => new Promise((resolve) => setTimeout(resolve, time));

// El backend puede estar dormido (Render): se reintenta con espera.
export async function fetchSummary(
  apiUrl,
  release,
  { attempts = 4, wait = 15000, fetchFn = fetch } = {},
) {
  const query = release ? `?release=${encodeURIComponent(release)}` : "";
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetchFn(`${apiUrl}/api/v1/vitals/summary${query}`, {
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(wait);
    }
  }
  throw new Error(`No se pudo leer el resumen de ${apiUrl}: ${lastError?.message}`);
}

async function main() {
  const apiUrl = (process.env.API_URL ?? "").replace(/\/+$/, "");
  const release = process.env.RELEASE ?? "";
  if (!/^https:\/\/[^\s/]+$/.test(apiUrl))
    throw new Error("API_URL debe ser una URL https sin ruta");
  if (release && !/^[A-Za-z0-9._-]{1,40}$/.test(release)) throw new Error("RELEASE no es válido");
  const runUrl = process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : "";
  const analysis = analyze(await fetchSummary(apiUrl, release));
  const options = { release, runUrl };
  const report = renderReport(analysis, options);
  writeFileSync("vitals-issue.md", renderIssue(analysis, options));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
  else console.log(report);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${analysis.status}\n`);
  console.log(`Estado: ${analysis.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
