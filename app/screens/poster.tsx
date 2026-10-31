"use client";

import { useState } from "react";
import Image from "next/image";
import { Film } from "lucide-react";
import { API_URL, type Movie } from "@/lib/api";

export const posterSrc = (id: number) => `${API_URL}/api/v1/movies/${id}/poster`;

export function Poster({ movie, thumbnail = false }: { movie: Movie; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  const className = thumbnail ? "poster ranking-poster" : "poster";
  return failed ? (
    <div
      className={`${className} placeholder`}
      role="img"
      aria-label={`Sin afiche de ${movie.title}`}
    >
      {thumbnail ? <Film aria-hidden="true" /> : movie.title}
    </div>
  ) : (
    <Image
      unoptimized
      width={thumbnail ? 40 : 500}
      height={thumbnail ? 60 : 750}
      className={className}
      src={posterSrc(movie.id)}
      alt={`Afiche de ${movie.title}`}
      onError={() => setFailed(true)}
    />
  );
}
