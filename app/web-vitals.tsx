"use client";

import { useEffect } from "react";
import type { MetricWithAttribution } from "web-vitals/attribution";
import { publishLive } from "@/lib/vitals-live";
import {
  buildPayload,
  elementOf,
  isVitalName,
  lcpParts,
  normalizePage,
  rate,
  sendVital,
} from "@/lib/vitals";

// Mide Core Web Vitals en el navegador de cada persona y los envía al backend. No pinta nada.
//
// Platea navega sin recargar (/ → /start → /room/x son la misma carga). web-vitals mide por carga,
// así que LCP, FCP y TTFB se atribuyen a la pantalla de entrada y INP y CLS, que se acumulan durante
// toda la visita, a la pantalla donde está la persona al reportarlos.
export function WebVitals() {
  useEffect(() => {
    let active = true;
    const landing = normalizePage(location.pathname);

    const report = (metric: MetricWithAttribution) => {
      if (!active) return;
      const page =
        metric.name === "INP" || metric.name === "CLS" ? normalizePage(location.pathname) : landing;
      if (!page) return;
      const payload = buildPayload(metric, page, {
        width: innerWidth,
        release: process.env.NEXT_PUBLIC_RELEASE,
      });
      if (payload) sendVital(payload);
    };

    // Cada cambio se muestra en vivo; el envío usa el valor final que web-vitals entrega al ocultarse la pestaña.
    const show = (metric: MetricWithAttribution) => {
      if (!active || !isVitalName(metric.name)) return;
      publishLive(metric.name, {
        value: metric.value,
        rating: rate(metric.name, metric.value),
        target: elementOf(metric),
        parts: lcpParts(metric),
      });
    };

    // Se importa después de hidratar para que web-vitals no compita con la carga de la página.
    import("web-vitals/attribution").then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      if (!active) return;
      for (const on of [onLCP, onINP, onCLS, onFCP, onTTFB]) {
        on(report);
        on(show, { reportAllChanges: true });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return null;
}
