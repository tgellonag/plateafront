import { API_URL } from "./api";

export type VitalName = "LCP" | "INP" | "CLS" | "FCP" | "TTFB";
export type Rating = "good" | "needs-improvement" | "poor";
export type Device = "celular" | "escritorio";

export const CORE_VITALS = ["LCP", "INP", "CLS"] as const;
export const VITAL_NAMES: VitalName[] = [...CORE_VITALS, "FCP", "TTFB"];

// Mismos umbrales que web.dev y que el backend: [bueno hasta, malo desde].
export const THRESHOLDS: Record<VitalName, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export const VITAL_INFO: Record<VitalName, { full: string; question: string }> = {
  LCP: { full: "Largest Contentful Paint", question: "¿Ya veo el contenido principal?" },
  INP: { full: "Interaction to Next Paint", question: "¿Responde cuando toco o escribo?" },
  CLS: { full: "Cumulative Layout Shift", question: "¿Se mueve mientras leo?" },
  FCP: { full: "First Contentful Paint", question: "¿Apareció algo en pantalla?" },
  TTFB: { full: "Time to First Byte", question: "¿Qué tan rápido respondió el servidor?" },
};

export const RATING_LABEL: Record<Rating, string> = {
  good: "Bueno",
  "needs-improvement": "Mejorable",
  poor: "Deficiente",
};

export function rate(name: VitalName, value: number): Rating {
  const [good, poor] = THRESHOLDS[name];
  if (value <= good) return "good";
  return value <= poor ? "needs-improvement" : "poor";
}

const number = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });
const score = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

export function formatVital(name: VitalName, value: number) {
  return name === "CLS" ? score.format(value) : `${number.format(value)} ms`;
}

export function formatThreshold(name: VitalName) {
  const [good, poor] = THRESHOLDS[name];
  const show = (value: number) =>
    name === "CLS" ? String(value).replace(".", ",") : number.format(value);
  const unit = name === "CLS" ? "" : " ms";
  return `bueno ≤ ${show(good)}${unit}, deficiente > ${show(poor)}${unit}`;
}

// Solo las pantallas de la app, con los segmentos dinámicos ocultos. Las rutas reales llevan el id de la
// sala y el código de invitación, que no deben guardarse. /vitals y /metrics no se miden.
export function normalizePage(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (path === "/" || path === "/start") return path;
  if (/^\/join\/[^/]+$/.test(path)) return "/join/[code]";
  if (/^\/join\/[^/]+\/start$/.test(path)) return "/join/[code]/start";
  if (/^\/room\/[^/]+$/.test(path)) return "/room/[id]";
  if (/^\/room\/[^/]+\/manage$/.test(path)) return "/room/[id]/manage";
  return null;
}

// Selector CSS del elemento responsable; para mostrarlo basta el último tramo.
export function shortTarget(selector: string | null | undefined) {
  return selector?.split(">").at(-1)?.trim() || null;
}

export type VitalPayload = {
  name: VitalName;
  value: number;
  id: string;
  page: string;
  device: Device;
  release: string;
  navigation_type: string;
  target: string | null;
  lcp?: Record<string, number>;
};

// Lo que usamos de MetricWithAttribution de web-vitals, para no depender de sus tipos completos.
// La atribución cambia según la métrica; se lee por nombre con las funciones de abajo.
export type VitalMetric = {
  name: string;
  value: number;
  id: string;
  navigationType?: string;
  attribution: object;
};

function attributionOf(metric: VitalMetric) {
  return metric.attribution as Record<string, unknown>;
}

export const LCP_PARTS = [
  "timeToFirstByte",
  "resourceLoadDelay",
  "resourceLoadDuration",
  "elementRenderDelay",
] as const;

const NAVIGATION_TYPES = [
  "navigate",
  "reload",
  "back-forward",
  "back-forward-cache",
  "prerender",
  "restore",
];

export function isVitalName(name: string): name is VitalName {
  return (VITAL_NAMES as string[]).includes(name);
}

const ELEMENT_KEY: Record<string, string> = {
  LCP: "target",
  INP: "interactionTarget",
  CLS: "largestShiftTarget",
};

export function elementOf(metric: VitalMetric) {
  const element = attributionOf(metric)[ELEMENT_KEY[metric.name]];
  return typeof element === "string" ? element : null;
}

export function lcpParts(metric: VitalMetric) {
  if (metric.name !== "LCP") return undefined;
  const parts: Record<string, number> = {};
  for (const key of LCP_PARTS) {
    const value = attributionOf(metric)[key];
    if (typeof value === "number" && Number.isFinite(value)) parts[key] = Math.round(value);
  }
  return parts;
}

export function buildPayload(
  metric: VitalMetric,
  page: string,
  env: { width: number; release?: string },
): VitalPayload | null {
  if (!isVitalName(metric.name) || !Number.isFinite(metric.value) || metric.value < 0) return null;
  const parts = lcpParts(metric);
  return {
    name: metric.name,
    value: +metric.value.toFixed(metric.name === "CLS" ? 3 : 0),
    id: metric.id,
    page,
    device: env.width <= 768 ? "celular" : "escritorio",
    release: env.release || "local",
    navigation_type: NAVIGATION_TYPES.includes(metric.navigationType ?? "")
      ? (metric.navigationType as string)
      : "",
    target: elementOf(metric),
    ...(parts && { lcp: parts }),
  };
}

// fetch con keepalive sobrevive al cierre de la pestaña, igual que sendBeacon, pero respeta CORS sin
// credenciales (la API vive en otro dominio). text/plain evita el preflight. Es de mejor esfuerzo:
// una métrica perdida nunca debe afectar la app.
export function sendVital(payload: VitalPayload) {
  try {
    fetch(`${API_URL}/api/v1/vitals`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
    }).catch(() => {});
  } catch {
    // sin red o sin fetch: se ignora
  }
}

export type VitalsRow = {
  page: string;
  device: Device;
  name: VitalName;
  samples: number;
  p75: number;
  good: number;
  needs_improvement: number;
  poor: number;
  top_element: string | null;
};

export type LcpBreakdown = {
  page: string;
  device: Device;
  samples: number;
  p75: {
    ttfb: number | null;
    load_delay: number | null;
    load_duration: number | null;
    render_delay: number | null;
  };
};

export type VitalsSummary = {
  min_samples: number;
  release: string;
  rows: VitalsRow[];
  lcp_parts: LcpBreakdown[];
  releases: { release: string; samples: number; last_received_at: string }[];
};
