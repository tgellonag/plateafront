"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, SlidersHorizontal } from "lucide-react";
import { request, type Filters } from "@/lib/api";
import type { ChangeEvent } from "react";
import type { Room } from "../use-room";
import type { Providers } from "../use-providers";

const genres: Record<number, string> = {
  28: "Acción",
  12: "Aventura",
  16: "Animación",
  35: "Comedia",
  80: "Crimen",
  99: "Documental",
  18: "Drama",
  10751: "Familia",
  14: "Fantasía",
  36: "Historia",
  27: "Terror",
  10402: "Música",
  9648: "Misterio",
  10749: "Romance",
  878: "Ciencia ficción",
  10770: "TV",
  53: "Suspenso",
  10752: "Bélica",
  37: "Western",
};

function numberValue(event: ChangeEvent<HTMLInputElement>) {
  const value = event.target.value.replace(/^0+(?=\d)/, "");
  event.target.value = value;
  return value === "" ? "" : +value;
}

export function FiltersSummary({ filters, providers }: { filters: Filters; providers: Providers }) {
  return (
    <details className="panel settings filters-summary">
      <summary>
        <SlidersHorizontal aria-hidden="true" />
        Filtros
        <ChevronDown className="disclosure-icon" aria-hidden="true" />
      </summary>
      <dl>
        <div>
          <dt>Géneros</dt>
          <dd>
            {filters.genre_ids.map((id) => genres[id] ?? `Género ${id}`).join(", ") || "Todos"}
          </dd>
        </div>
        <div>
          <dt>Streaming en Chile</dt>
          <dd>
            {filters.provider_ids.map((id) => providers.names[id] ?? `Servicio ${id}`).join(", ") ||
              "Todos los servicios"}
          </dd>
        </div>
        <div>
          <dt>Año desde</dt>
          <dd>{filters.min_year}</dd>
        </div>
        <div>
          <dt>Duración máxima</dt>
          <dd>{filters.max_runtime} min</dd>
        </div>
        <div>
          <dt>Películas por ronda</dt>
          <dd>{filters.movie_count}</dd>
        </div>
      </dl>
    </details>
  );
}

export function FiltersForm({
  room,
  providers,
  saved,
}: {
  room: Room;
  providers: Providers;
  saved: Filters;
}) {
  const [filters, setDraft] = useState<
      Omit<Filters, "min_year" | "max_runtime" | "movie_count"> & {
        min_year: number | "";
        max_runtime: number | "";
        movie_count: number | "";
      }
    >(saved),
    [edited, setEdited] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [search, setSearch] = useState("");
  const saving = useRef<Promise<void>>(Promise.resolve());
  const { access, filtersPending, setFiltersPending } = room;
  const valid =
    Number.isInteger(filters.min_year) &&
    +filters.min_year >= 1888 &&
    +filters.min_year <= new Date().getFullYear() + 2 &&
    Number.isInteger(filters.max_runtime) &&
    +filters.max_runtime >= 1 &&
    +filters.max_runtime <= 600 &&
    Number.isInteger(filters.movie_count) &&
    +filters.movie_count >= 5 &&
    +filters.movie_count <= 20;
  function setFilters(next: typeof filters) {
    setDraft(next);
    setEdited(true);
    setError("");
    setFiltersPending(true);
  }
  useEffect(() => {
    if (!edited || !access || !valid) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Serialize requests so a slower, older save cannot overwrite the latest edit.
      saving.current = saving.current.then(async () => {
        if (cancelled) return;
        try {
          await request(`/api/v1/sessions/${access.session_id}/filters`, access.token, filters);
          if (!cancelled) setFiltersPending(false);
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        }
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [access, edited, filters, retry, setFiltersPending, valid]);
  useEffect(() => () => setFiltersPending(false), [setFiltersPending]);
  const options = [
    ...providers.list,
    ...filters.provider_ids
      .filter((id) => !providers.names[id])
      .map((id) => ({ provider_id: id, provider_name: `Servicio ${id}` })),
  ].filter((p) =>
    p.provider_name.toLocaleLowerCase("es").includes(search.trim().toLocaleLowerCase("es")),
  );
  return (
    <details className="panel settings">
      <summary>
        <SlidersHorizontal aria-hidden="true" />
        Filtros
        <ChevronDown className="disclosure-icon" aria-hidden="true" />
      </summary>
      <form onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Géneros</legend>
          <div className="chips">
            {Object.entries(genres).map(([id, title]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={filters.genre_ids.includes(+id)}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      genre_ids: e.target.checked
                        ? [...filters.genre_ids, +id]
                        : filters.genre_ids.filter((v) => v !== +id),
                    })
                  }
                />
                {title}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Streaming en Chile</legend>
          {providers.loading && <p role="status">Cargando servicios…</p>}
          {providers.error && (
            <div className="provider-error">
              <p role="alert">{providers.error}</p>
              <button
                type="button"
                disabled={providers.loading}
                onClick={() => void providers.load()}
              >
                <RefreshCw aria-hidden="true" />
                Reintentar
              </button>
            </div>
          )}
          {providers.stale && <small>Lista guardada; puede haber cambiado.</small>}
          {providers.list.length > 12 && (
            <label>
              Buscar servicio
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre del servicio"
              />
            </label>
          )}
          <div className="chips provider-options">
            {options.map(({ provider_id: id, provider_name: title }) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={filters.provider_ids.includes(+id)}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      provider_ids: e.target.checked
                        ? [...filters.provider_ids, +id]
                        : filters.provider_ids.filter((v) => v !== +id),
                    })
                  }
                />
                {title}
              </label>
            ))}
          </div>
          {!providers.loading && !providers.error && options.length === 0 && (
            <p>No hay servicios que coincidan.</p>
          )}
          <small>El filtro de películas considera solo suscripciones.</small>
        </fieldset>
        <label>
          Año desde
          <input
            type="number"
            required
            min={1888}
            max={new Date().getFullYear() + 2}
            value={filters.min_year}
            onChange={(e) => setFilters({ ...filters, min_year: numberValue(e) })}
          />
        </label>
        <label>
          Duración máxima (min)
          <input
            type="number"
            required
            min={1}
            max={600}
            value={filters.max_runtime}
            onChange={(e) => setFilters({ ...filters, max_runtime: numberValue(e) })}
          />
        </label>
        <label>
          Películas por ronda
          <input
            type="number"
            required
            min={5}
            max={20}
            value={filters.movie_count}
            onChange={(e) => setFilters({ ...filters, movie_count: numberValue(e) })}
          />
        </label>
        {error ? (
          <div className="provider-error">
            <p role="alert">No se guardaron los filtros: {error}</p>
            <button
              type="button"
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
              }}
            >
              <RefreshCw aria-hidden="true" /> Reintentar
            </button>
          </div>
        ) : (
          <small role="status">
            {filtersPending
              ? valid
                ? "Guardando filtros…"
                : "Completa los números dentro de los límites indicados."
              : "Los cambios se guardan automáticamente."}
          </small>
        )}
        <small>Sin selección se incluyen todos.</small>
      </form>
    </details>
  );
}
