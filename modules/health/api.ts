import { apiGet, ApiError } from "@/lib/api";
import type { HealthResponse } from "./types";

export async function getHealth(): Promise<HealthResponse> {
  try {
    return await apiGet<HealthResponse>("/health");
  } catch (e) {
    // 503 still carries a valid HealthResponse body (db down)
    if (e instanceof ApiError && e.status === 503) return e.body as HealthResponse;
    throw e;
  }
}
