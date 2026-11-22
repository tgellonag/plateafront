import { useSyncExternalStore } from "react";
import type { Rating, VitalName } from "./vitals";

export type LiveVital = {
  value: number;
  rating: Rating;
  target: string | null;
  parts?: Record<string, number>;
};

type Live = Partial<Record<VitalName, LiveVital>>;

const EMPTY: Live = {};
const listeners = new Set<() => void>();
let live: Live = EMPTY;

// Última medición de esta carga de página, en memoria: alimenta el bloque «Esta visita» de /vitals.
export function publishLive(name: VitalName, vital: LiveVital) {
  live = { ...live, [name]: vital };
  listeners.forEach((listener) => listener());
}

export function resetLive() {
  live = EMPTY;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveVitals() {
  return useSyncExternalStore(
    subscribe,
    () => live,
    () => EMPTY,
  );
}
