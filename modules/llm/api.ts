import { apiGet } from "@/lib/api";
import type { LlmResponse } from "./types";

export const ask = (q: string) => apiGet<LlmResponse>(`/llm?q=${encodeURIComponent(q)}`);
