"use client";

import { useEffect, useId, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, Star } from "lucide-react";
import type { Movie } from "@/lib/api";
import { TrailerCache, type Trailer } from "../trailer-cache";
import type { Providers } from "../use-providers";
import { Poster } from "./poster";

function TrailerPlayer({ movie, trailers }: { movie: Movie; trailers: TrailerCache }) {
  const [trailer, setTrailer] = useState<Trailer | null>(() => trailers.peek(movie.id) ?? null);
  const [loading, setLoading] = useState(() => trailers.peek(movie.id) === undefined);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void trailers
      .load(movie.id)
      .then((video) => {
        if (!cancelled) setTrailer(video);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trailers, movie.id, attempt]);

  if (loading) return <p role="status">Buscando tráiler…</p>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button
          onClick={() => {
            setError("");
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
        >
          <RefreshCw aria-hidden="true" /> Reintentar
        </button>
      </div>
    );
  if (!trailer) return <p>No hay un tráiler disponible para esta película.</p>;
  return (
    <div className="movie-trailer">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${trailer.key}`}
        title={`Tráiler de ${movie.title}`}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {trailer.language === "en-US" && <small>Tráiler en inglés</small>}
      <a href={`https://www.youtube.com/watch?v=${trailer.key}`} target="_blank" rel="noreferrer">
        Abrir en YouTube <ExternalLink aria-hidden="true" />
      </a>
    </div>
  );
}

export function MovieCard({
  movie,
  providers,
  trailers,
}: {
  movie: Movie;
  providers: Providers;
  trailers: TrailerCache;
}) {
  const [backMovieID, setBackMovieID] = useState<number | null>(null);
  const [expandedMovieID, setExpandedMovieID] = useState<number | null>(null);
  // A prefetched trailer must never decide which face a new movie displays.
  const back = backMovieID === movie.id;
  const expanded = expandedMovieID === movie.id;
  const synopsisId = useId();
  const overview = movie.overview.trim();
  const canExpand = overview.length > 180;
  const preview = canExpand ? `${overview.slice(0, 180).replace(/\s+\S*$/, "")}…` : overview;
  return (
    <article className={`movie-card${back ? " movie-card-back" : ""}`}>
      {back ? (
        <div className="movie-back">
          <div className="movie-back-heading">
            <button
              className="movie-back-button"
              aria-label="Volver al afiche"
              title="Volver al afiche"
              onClick={() => setBackMovieID(null)}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <h2>{movie.title}</h2>
          </div>
          <TrailerPlayer movie={movie} trailers={trailers} />
          <div className="movie-synopsis">
            <p id={synopsisId}>{(expanded ? overview : preview) || "Sin sinopsis disponible."}</p>
            {canExpand && (
              <button
                className="movie-synopsis-toggle"
                aria-expanded={expanded}
                aria-controls={synopsisId}
                onClick={() => setExpandedMovieID(expanded ? null : movie.id)}
              >
                {expanded ? "Ver menos" : "Leer más"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <Poster movie={movie} />
          <button
            type="button"
            className="movie-front-button"
            aria-label={`Ver sinopsis y tráiler de ${movie.title}`}
            onClick={() => setBackMovieID(movie.id)}
          />
          <div className="movie-copy">
            <h2>{movie.title}</h2>
            <p>
              {movie.year} · {movie.runtime} min
            </p>
            <span className="rating">
              <Star aria-hidden="true" />
              {movie.rating.toFixed(1)}
            </span>
            <small>
              Streaming:{" "}
              {movie.provider_ids.map((id) => providers.names[id] ?? `Servicio ${id}`).join(", ") ||
                "Sin información"}
            </small>
          </div>
        </>
      )}
    </article>
  );
}
