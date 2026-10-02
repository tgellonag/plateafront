export type Movie = { id: number; title: string; overview: string; poster_path: string | null };
export type MoviesResponse = Movie[];
export type MoviesErrorResponse = { error: "db" };
