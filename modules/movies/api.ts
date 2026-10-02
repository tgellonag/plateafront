import { apiGet } from "@/lib/api";
import type { MoviesResponse } from "./types";

export const getMovies = () => apiGet<MoviesResponse>("/movies");

export const posterUrl = (path: string) => `https://image.tmdb.org/t/p/w342${path}`;
