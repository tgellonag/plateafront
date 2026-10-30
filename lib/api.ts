export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(API_URL + path);
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.json() as Promise<T>;
}

export type Provider = { provider_id: number; provider_name: string };
export type Filters = {
  genre_ids: number[];
  provider_ids: number[];
  min_year: number;
  max_runtime: number;
  movie_count: number;
};
export type Movie = {
  id: number;
  title: string;
  overview: string;
  year: number;
  runtime: number;
  genre_ids: number[];
  provider_ids: number[];
  rating: number;
  round: number;
  position: number;
  likes: number;
  dislikes: number;
  score: number;
  match: boolean;
};
export type Person = { id: string; name: string; is_host: boolean; progress: number };
export type State = {
  session: {
    id: string;
    status: "open" | "voting" | "closed";
    filters: Filters;
    round: number;
    chosen_movie_id: number | null;
  };
  me: Person;
  participants: Person[];
  movies: Movie[];
  votes: { participant_id: string; movie_id: number; liked: boolean; participant_name?: string }[];
  invitation: { code: string; expires_at: string } | null;
};
export type Access = { session_id: string; token: string };

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  token?: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(90000)])
      : AbortSignal.timeout(90000),
  });
  const data = await res
    .json()
    .catch(() => ({ error: "El servidor no respondió. Puede estar iniciándose; reintenta." }));
  if (!res.ok)
    throw new RequestError(data.error ?? "No se pudo completar la solicitud", res.status);
  return data;
}
