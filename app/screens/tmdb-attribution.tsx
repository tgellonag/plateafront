import Image from "next/image";

export function TmdbAttribution() {
  return (
    <footer className="tmdb-attribution">
      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">
        <Image src="/tmdb.svg" alt="The Movie Database (TMDB)" width={120} height={9} />
      </a>
      <p>Este producto usa la API de TMDB, pero TMDB no lo avala ni lo certifica.</p>
    </footer>
  );
}
