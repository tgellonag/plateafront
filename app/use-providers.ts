"use client";

import { useCallback, useEffect, useState } from "react";
import { request, type Provider } from "@/lib/api";

export type Providers = ReturnType<typeof useProviders>;

export function useProviders() {
  const [list, setList] = useState<Provider[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<{ providers: Provider[]; stale: boolean }>("/api/v1/providers");
      setList(result.providers);
      setStale(result.stale);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);
  const names: Record<number, string> = Object.fromEntries(
    list.map((p) => [p.provider_id, p.provider_name]),
  );
  return { list, names, loading, error, stale, load };
}
