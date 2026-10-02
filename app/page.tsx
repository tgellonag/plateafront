import Image from "next/image";
import { connection } from "next/server";
import { getHealth } from "@/modules/health/api";
import { getMovies, posterUrl } from "@/modules/movies/api";

export default async function Home() {
  await connection();
  // ponytail: /movies hits TMDB on every request. Fine for the demo; add `use cache` or revalidation before real traffic.
  const [health, movies] = await Promise.allSettled([getHealth(), getMovies()]);

  const healthText =
    health.status === "rejected"
      ? "Backend unreachable"
      : health.value.db === "ok"
        ? "Backend ok · DB ok"
        : "Backend ok · DB down";

  return (
    <main className="mx-auto w-full max-w-5xl p-8">
      <h1 className="text-2xl font-semibold text-primary">Platea</h1>
      <p className="mt-1 text-sm text-secondary">{healthText}</p>

      {movies.status === "rejected" ? (
        <p className="mt-8 text-base text-primary">Could not load movies.</p>
      ) : movies.value.length === 0 ? (
        <p className="mt-8 text-base text-secondary">No movies yet.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
          {movies.value.map((m) => (
            <li key={m.id}>
              {m.poster_path ? (
                <Image
                  src={posterUrl(m.poster_path)}
                  alt={m.title}
                  width={342}
                  height={513}
                  className="aspect-[2/3] w-full rounded object-cover"
                />
              ) : (
                <div className="aspect-[2/3] w-full rounded bg-secondary/20" />
              )}
              <h2 className="mt-2 text-lg font-medium">{m.title}</h2>
              <p className="line-clamp-3 text-sm text-secondary">{m.overview}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
