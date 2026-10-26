"use client";

import { useState } from "react";
import Link from "next/link";
import { ChartNoAxesColumn, Film } from "lucide-react";

type Metrics = {
  created: number;
  started: number;
  closed: number;
  confirmed: number;
  within_15_minutes: number;
  decision_rate: number;
  median_seconds: number | null;
  votes: number;
};
export default function MetricsPage() {
  const [token, setToken] = useState(""),
    [metrics, setMetrics] = useState<Metrics | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="shell">
      <header>
        <Link className="brand" href="/">
          <Film aria-hidden="true" /> Platea
        </Link>
      </header>
      <h1>Métricas</h1>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const res = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/v1/metrics`,
              { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
            );
            if (!res.ok) throw new Error("Acceso inválido o métricas no disponibles");
            setMetrics(await res.json());
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Token de administración
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
          />
        </label>
        <button disabled={busy}>
          <ChartNoAxesColumn aria-hidden="true" />
          {busy ? "Consultando…" : "Consultar"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {metrics && (
        <section className="panel">
          <h2>Tasa de decisión en 15 minutos: {metrics.decision_rate.toFixed(1)}%</h2>
          <dl>
            {Object.entries({
              "Sesiones creadas": metrics.created,
              "Votaciones iniciadas": metrics.started,
              "Sesiones cerradas": metrics.closed,
              "Elecciones confirmadas": metrics.confirmed,
              "Elecciones en ≤15 minutos": metrics.within_15_minutes,
              "Votos considerados": metrics.votes,
              "Mediana hasta elegir (segundos)": metrics.median_seconds ?? "Sin elecciones",
            }).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            Se excluyen únicamente las sesiones marcadas como pruebas al crearlas. Los abandonos
            permanecen en el denominador. Cerrar o tener match no cuenta como elegir.
          </p>
        </section>
      )}
    </main>
  );
}
