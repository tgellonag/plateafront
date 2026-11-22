import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Versión desplegada para agrupar las métricas de rendimiento: en Vercel es el SHA corto del commit.
    NEXT_PUBLIC_RELEASE: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
  },
};

export default nextConfig;
