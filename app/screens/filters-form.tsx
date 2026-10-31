"use client";

import { useState } from "react";
import { ChevronDown, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import type { Filters } from "@/lib/api";
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

export function FiltersForm({
  room,
  providers,
  saved,
}: {
  room: Room;
  providers: Providers;
  saved: Filters;
}) {
  // Draft survives room refreshes until saved; it resets only when the lobby remounts.
  const [filters, setFilters] = useState(saved),
    [search, setSearch] = useState("");
  const { busy, run } = room;
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run("filters", filters);
        }}
      >
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
            min={1888}
            max={new Date().getFullYear() + 2}
            value={filters.min_year}
            onChange={(e) => setFilters({ ...filters, min_year: +e.target.value })}
          />
        </label>
        <label>
          Duración máxima (min)
          <input
            type="number"
            min={1}
            max={600}
            value={filters.max_runtime}
            onChange={(e) => setFilters({ ...filters, max_runtime: +e.target.value })}
          />
        </label>
        <label>
          Películas por ronda
          <input
            type="number"
            min={5}
            max={20}
            value={filters.movie_count}
            onChange={(e) => setFilters({ ...filters, movie_count: +e.target.value })}
          />
        </label>
        <button disabled={busy}>
          <Save aria-hidden="true" />
          Guardar filtros
        </button>
        <small>Sin selección se incluyen todos. Guarda los cambios antes de iniciar.</small>
      </form>
    </details>
  );
}
