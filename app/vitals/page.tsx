"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Film, RefreshCw } from "lucide-react";
import { RequestError, request } from "@/lib/api";
import {
  CORE_VITALS,
  RATING_LABEL,
  VITAL_INFO,
  VITAL_NAMES,
  formatThreshold,
  formatVital,
  rate,
  shortTarget,
  type Device,
  type LcpBreakdown,
  type VitalName,
  type VitalsRow,
  type VitalsSummary,
} from "@/lib/vitals";
import { useLiveVitals } from "@/lib/vitals-live";

const PAGE_LABEL: Record<string, string> = {
  "/": "Nombre",
  "/start": "Crear o unirse",
  "/join/[code]": "Invitación: nombre",
  "/join/[code]/start": "Invitación: ingreso",
  "/room/[id]": "Sala y votación",
  "/room/[id]/manage": "Ranking",
};

const WAITING: Record<VitalName, string> = {
  LCP: "Esperando el elemento más grande de la página.",
  INP: "Aparece al interactuar: toca, haz clic o escribe en esta página.",
  CLS: "Midiendo los movimientos de la página.",
  FCP: "Esperando el primer texto o imagen.",
  TTFB: "Esperando la respuesta del servidor.",
};

const LCP_SEGMENTS = [
  { key: "ttfb", label: "Primer byte (TTFB)", help: "Espera del primer byte del HTML." },
  {
    key: "load_delay",
    label: "Retraso de carga",
    help: "Desde el HTML hasta que se pide el recurso del LCP.",
  },
  {
    key: "load_duration",
    label: "Duración de carga",
    help: "Lo que tarda en descargarse el recurso del LCP.",
  },
  { key: "render_delay", label: "Retraso de render", help: "Desde que llega hasta que se pinta." },
] as const;

const MEANING: Record<(typeof CORE_VITALS)[number], string> = {
  LCP: "Es el tiempo hasta que se pinta el elemento más grande visible: una imagen, un video o un bloque de texto.",
  INP: "Es la demora entre un clic, toque o tecla y el siguiente cuadro pintado; se reporta la interacción más lenta de la visita y solo existe si la persona interactuó.",
  CLS: "Suma cuánto se mueve el contenido visible sin que la persona lo provoque; no tiene unidad.",
};

const SOURCES = [
  ["Web Vitals", "https://web.dev/articles/vitals"],
  ["Umbrales de Core Web Vitals", "https://web.dev/articles/defining-core-web-vitals-thresholds"],
  ["Datos de laboratorio y de campo", "https://web.dev/articles/lab-and-field-data-differences"],
  ["Optimizar el LCP y sus subpartes", "https://web.dev/articles/optimize-lcp"],
] as const;

function LiveVitals() {
  const live = useLiveVitals();
  return (
    <section className="vitals-section" aria-labelledby="vitals-live">
      <h2 id="vitals-live">Esta visita</h2>
      <p>
        Mide la carga de esta página, no la del resto de la app: la experiencia en las demás
        pantallas está en la tabla de usuarios reales. Esta página no envía sus propias mediciones.
      </p>
      <dl className="vitals-live">
        {VITAL_NAMES.map((name) => {
          const vital = live[name];
          const target = shortTarget(vital?.target);
          return (
            <div key={name} data-testid={`live-${name}`}>
              <dt>
                <strong>{name}</strong> {VITAL_INFO[name].full}
              </dt>
              <dd className={vital ? `rating-${vital.rating}` : undefined}>
                {vital ? formatVital(name, vital.value) : "…"}
                {vital && <span className="rating-label">{RATING_LABEL[vital.rating]}</span>}
              </dd>
              <dd className="vitals-hint">
                {vital
                  ? target
                    ? `Elemento: ${target}`
                    : "Ningún elemento responsable."
                  : WAITING[name]}
              </dd>
              {vital?.parts && Object.keys(vital.parts).length > 0 && (
                <dd className="vitals-hint">
                  TTFB {vital.parts.timeToFirstByte ?? 0} ms · retraso de carga{" "}
                  {vital.parts.resourceLoadDelay ?? 0} ms · duración de carga{" "}
                  {vital.parts.resourceLoadDuration ?? 0} ms · retraso de render{" "}
                  {vital.parts.elementRenderDelay ?? 0} ms
                </dd>
              )}
              <dd className="vitals-hint">{formatThreshold(name)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Percentiles({ rows, minSamples }: { rows: VitalsRow[]; minSamples: number }) {
  const low = rows.some((row) => row.samples < minSamples);
  return (
    <>
      {low && (
        <p role="note" className="vitals-warning">
          Las filas con * tienen menos de {minSamples} muestras: el p75 solo indica la dirección y
          no sirve para decidir.
        </p>
      )}
      <div className="vitals-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Pantalla</th>
              <th scope="col">Métrica</th>
              <th scope="col" className="num">
                Muestras
              </th>
              <th scope="col" className="num">
                p75
              </th>
              <th scope="col" className="num">
                Bueno
              </th>
              <th scope="col" className="num">
                Mejorable
              </th>
              <th scope="col" className="num">
                Deficiente
              </th>
              <th scope="col">Elemento más frecuente (desde el p75)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rating = rate(row.name, row.p75);
              const percent = (count: number) => `${Math.round((100 * count) / row.samples)}%`;
              return (
                <tr key={`${row.page}|${row.name}`}>
                  <th scope="row">
                    <code>{row.page}</code>
                    <small>{PAGE_LABEL[row.page]}</small>
                  </th>
                  <td>{row.name}</td>
                  <td className="num">
                    {row.samples}
                    {row.samples < minSamples && (
                      <abbr title={`Menos de ${minSamples} muestras`} aria-label="muestra baja">
                        {" "}
                        *
                      </abbr>
                    )}
                  </td>
                  <td className={`num rating-${rating}`}>
                    {formatVital(row.name, row.p75)}
                    <span className="rating-label">{RATING_LABEL[rating]}</span>
                  </td>
                  <td className="num">{percent(row.good)}</td>
                  <td className="num">{percent(row.needs_improvement)}</td>
                  <td className="num">{percent(row.poor)}</td>
                  <td>{row.top_element ? <code>{shortTarget(row.top_element)}</code> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LcpParts({ parts }: { parts: LcpBreakdown[] }) {
  return (
    <section className="vitals-section" aria-labelledby="vitals-lcp">
      <h3 id="vitals-lcp">De qué se compone el LCP (p75 de cada parte)</h3>
      <p>
        El LCP se descompone en cuatro tiempos consecutivos. Muestran dónde se va el tiempo, que es
        el paso previo a decidir qué optimizar. Cada parte tiene su propio p75, así que no suman
        exactamente el p75 del LCP.
      </p>
      <ul className="vitals-legend">
        {LCP_SEGMENTS.map((segment, index) => (
          <li key={segment.key}>
            <span className={`swatch part-${index}`} aria-hidden="true" />
            <strong>{segment.label}:</strong> {segment.help}
          </li>
        ))}
      </ul>
      {parts.map((part) => {
        const values = LCP_SEGMENTS.map((segment) => part.p75[segment.key] ?? 0);
        return (
          <div key={part.page} className="vitals-parts" data-testid={`parts-${part.page}`}>
            <p>
              <code>{part.page}</code> · {part.samples}{" "}
              {part.samples === 1 ? "muestra" : "muestras"}
            </p>
            <div
              className="vitals-bar"
              role="img"
              aria-label={LCP_SEGMENTS.map(
                (segment, index) => `${segment.label} ${values[index]} ms`,
              ).join(", ")}
            >
              {values.map((value, index) => (
                <span
                  key={LCP_SEGMENTS[index].key}
                  className={`part-${index}`}
                  style={{ flexGrow: Math.max(value, 1) }}
                >
                  {value} ms
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Explainer() {
  return (
    <section className="vitals-section vitals-explainer" aria-labelledby="vitals-how">
      <h2 id="vitals-how">Cómo leer estos resultados</h2>
      <h3>Qué medimos</h3>
      <ul>
        {CORE_VITALS.map((name) => (
          <li key={name}>
            <strong>{name}</strong> ({VITAL_INFO[name].full}): {VITAL_INFO[name].question}{" "}
            {MEANING[name]} <span className="vitals-hint">({formatThreshold(name)}.)</span>
          </li>
        ))}
        <li>
          <strong>FCP</strong> y <strong>TTFB</strong> no son Core Web Vitals, pero ayudan a
          diagnosticar: el primero marca cuándo aparece algo en pantalla y el segundo cuánto tardó
          el servidor en responder.
        </li>
      </ul>
      <h3>Qué es el p75</h3>
      <p>
        Se ordenan las visitas de la más rápida a la más lenta y se toma el valor que deja al 75%
        por debajo (la posición ceil(0,75 × n)). Si el p75 está en verde, al menos 3 de cada 4
        visitas tuvieron un valor bueno. Un promedio esconde a las visitas lentas; el p75 no. Se
        evalúa por separado en celular y en escritorio; aquí, un ancho de pantalla de hasta 768 px
        cuenta como celular.
      </p>
      <h3>De dónde salen los datos</h3>
      <p>
        Son mediciones de usuarios reales: el navegador de cada persona mide su propia visita, con
        su dispositivo y su red, y la envía al backend de Platea. No es lo mismo que una prueba de
        laboratorio como Lighthouse (una sola carga simulada) ni que el resumen de 28 días de CrUX,
        que necesita bastante tráfico.
      </p>
      <h3>Límites que conviene tener presentes</h3>
      <ul>
        <li>
          Con pocas muestras el p75 es una pista, no una conclusión. Las filas con menos muestras de
          las necesarias van marcadas con *.
        </li>
        <li>
          Platea navega sin recargar la página. LCP, FCP y TTFB se atribuyen a la pantalla por la
          que se entró; INP y CLS se acumulan durante toda la visita y se atribuyen a la pantalla
          donde la persona estaba al reportarlos.
        </li>
        <li>
          INP y CLS se informan cuando la pestaña se oculta o se cierra, por eso una visita aparece
          cuando la persona se va. No todos los navegadores exponen todas las métricas, así que las
          muestras pueden diferir entre métricas.
        </li>
        <li>
          La versión «local» son pruebas en desarrollo; en producción es el identificador del commit
          desplegado.
        </li>
        <li>
          No se guardan IP ni identidad: solo la métrica, la pantalla (sin id de sala ni código de
          invitación), el tipo de dispositivo y el elemento responsable.
        </li>
      </ul>
      <h3>Fuentes</h3>
      <ul>
        {SOURCES.map(([label, href]) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function VitalsPage() {
  const [data, setData] = useState<VitalsSummary | null>(null);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<Device>("celular");
  const [release, setRelease] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let ignore = false;
    const query = release ? `?release=${encodeURIComponent(release)}` : "";
    request<VitalsSummary>(`/api/v1/vitals/summary${query}`)
      .then((summary) => {
        if (ignore) return;
        setData(summary);
        setError("");
      })
      .catch((e) => {
        if (ignore) return;
        setError(
          e instanceof RequestError ? e.message : "No se pudo conectar con el servidor. Reintenta.",
        );
      });
    return () => {
      ignore = true;
    };
  }, [release, attempt]);

  const rows = data?.rows.filter((row) => row.device === device) ?? [];
  const parts = data?.lcp_parts.filter((part) => part.device === device) ?? [];
  const loading = !data && !error;

  return (
    <main className="shell vitals-shell">
      <header>
        <Link className="brand" href="/">
          <Film aria-hidden="true" /> Platea
        </Link>
      </header>
      <h1>Core Web Vitals</h1>
      <p>
        Cómo se siente Platea para quienes la usan: cuánto tarda en mostrar el contenido (LCP),
        cuánto tarda en responder (INP) y cuánto se mueve mientras se lee (CLS). Se miden en el
        navegador de cada persona con la librería web-vitals de Google.
      </p>

      <LiveVitals />

      <section className="vitals-section" aria-labelledby="vitals-field">
        <h2 id="vitals-field">Usuarios reales (percentil 75)</h2>
        <div className="vitals-controls">
          <div role="group" aria-label="Dispositivo" className="vitals-toggle">
            {(["celular", "escritorio"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={device === option}
                onClick={() => setDevice(option)}
              >
                {option === "celular" ? "Celular" : "Escritorio"}
              </button>
            ))}
          </div>
          <label>
            Versión
            <select value={release} onChange={(e) => setRelease(e.target.value)}>
              <option value="">Todas</option>
              {data?.releases.map((item) => (
                <option key={item.release} value={item.release}>
                  {item.release} ({item.samples})
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading && (
          <p role="status">
            Cargando el resumen… Si el servidor estaba dormido, puede tardar hasta un minuto.
          </p>
        )}
        {error && (
          <div role="alert" className="alert">
            {error}
            <button
              type="button"
              onClick={() => {
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              <RefreshCw aria-hidden="true" /> Reintentar
            </button>
          </div>
        )}
        {data && rows.length === 0 && (
          <p role="status">
            Aún no hay muestras de {device === "celular" ? "celular" : "escritorio"}
            {release ? ` en la versión ${release}` : ""}. Usa la app y vuelve en un momento: cada
            visita se informa cuando se oculta o se cierra la pestaña.
          </p>
        )}
        {rows.length > 0 && data && <Percentiles rows={rows} minSamples={data.min_samples} />}
        {parts.length > 0 && <LcpParts parts={parts} />}
      </section>

      <Explainer />
    </main>
  );
}
