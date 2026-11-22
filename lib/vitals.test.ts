import { afterEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "./api";
import {
  THRESHOLDS,
  VITAL_NAMES,
  buildPayload,
  elementOf,
  formatThreshold,
  formatVital,
  normalizePage,
  rate,
  sendVital,
  shortTarget,
  type VitalMetric,
} from "./vitals";

afterEach(() => vi.unstubAllGlobals());

const lcp: VitalMetric = {
  name: "LCP",
  value: 2345.67,
  id: "v6-1700000000000-1",
  navigationType: "navigate",
  attribution: {
    target: "html>body>main>section.welcome>h1",
    timeToFirstByte: 166.4,
    resourceLoadDelay: 12.6,
    resourceLoadDuration: 0,
    elementRenderDelay: 27,
  },
};

describe("rate", () => {
  it.each([
    ["LCP", 2500, "good"],
    ["LCP", 2501, "needs-improvement"],
    ["LCP", 4000, "needs-improvement"],
    ["LCP", 4001, "poor"],
    ["INP", 200, "good"],
    ["INP", 500, "needs-improvement"],
    ["INP", 501, "poor"],
    ["CLS", 0.1, "good"],
    ["CLS", 0.25, "needs-improvement"],
    ["CLS", 0.26, "poor"],
    ["FCP", 1800, "good"],
    ["TTFB", 1801, "poor"],
  ] as const)("VITALS-R1 %s %s is %s", (name, value, expected) => {
    expect(rate(name, value)).toBe(expected);
  });

  it("VITALS-R1 matches the thresholds the backend uses", () => {
    expect(THRESHOLDS).toEqual({
      LCP: [2500, 4000],
      INP: [200, 500],
      CLS: [0.1, 0.25],
      FCP: [1800, 3000],
      TTFB: [800, 1800],
    });
  });
});

describe("formatting", () => {
  it("shows milliseconds with Chilean separators and CLS with three decimals", () => {
    expect(formatVital("LCP", 2345.6)).toBe("2.346 ms");
    expect(formatVital("INP", 80)).toBe("80 ms");
    expect(formatVital("CLS", 0.0123)).toBe("0,012");
  });

  it("describes the thresholds of each metric", () => {
    expect(formatThreshold("LCP")).toBe("bueno ≤ 2.500 ms, deficiente > 4.000 ms");
    expect(formatThreshold("CLS")).toBe("bueno ≤ 0,1, deficiente > 0,25");
  });

  it("keeps only the last segment of a selector", () => {
    expect(shortTarget("html>body>main>img.hero")).toBe("img.hero");
    expect(shortTarget("button")).toBe("button");
    expect(shortTarget(null)).toBeNull();
    expect(shortTarget("")).toBeNull();
  });
});

describe("normalizePage", () => {
  it.each([
    ["/", "/"],
    ["/start", "/start"],
    ["/start/", "/start"],
    ["/start//", "/start"],
    ["/join/ABC234", "/join/[code]"],
    ["/join/ABC234/start", "/join/[code]/start"],
    ["/room/3f2c9d1e-0000-4000-a000-000000000000", "/room/[id]"],
    ["/room/3f2c9d1e-0000-4000-a000-000000000000/manage", "/room/[id]/manage"],
  ])("VITALS-R8 %s is reported as %s", (path, page) => {
    expect(normalizePage(path)).toBe(page);
  });

  it.each(["/vitals", "/metrics", "/otra", "/room", "/room/a/b/c", "/join/A/B"])(
    "VITALS-R8 %s is never reported",
    (path) => {
      expect(normalizePage(path)).toBeNull();
    },
  );

  it("VITALS-R8 never leaves a room id or an invitation code in the result", () => {
    for (const path of ["/join/ZZZ999", "/room/secret-id", "/room/secret-id/manage"]) {
      expect(normalizePage(path)).not.toMatch(/ZZZ999|secret-id/);
    }
  });
});

describe("buildPayload", () => {
  it("VITALS-R9 builds the LCP payload with rounded value, parts and element", () => {
    expect(buildPayload(lcp, "/", { width: 390, release: "abc1234" })).toEqual({
      name: "LCP",
      value: 2346,
      id: "v6-1700000000000-1",
      page: "/",
      device: "celular",
      release: "abc1234",
      navigation_type: "navigate",
      target: "html>body>main>section.welcome>h1",
      lcp: {
        timeToFirstByte: 166,
        resourceLoadDelay: 13,
        resourceLoadDuration: 0,
        elementRenderDelay: 27,
      },
    });
  });

  it("VITALS-R9 keeps three decimals for CLS and uses the element that shifted", () => {
    const cls: VitalMetric = {
      name: "CLS",
      value: 0.123456,
      id: "v6-2",
      navigationType: "back-forward-cache",
      attribution: { largestShiftTarget: "div.card" },
    };
    expect(buildPayload(cls, "/start", { width: 1280 })).toEqual({
      name: "CLS",
      value: 0.123,
      id: "v6-2",
      page: "/start",
      device: "escritorio",
      release: "local",
      navigation_type: "back-forward-cache",
      target: "div.card",
    });
  });

  it("VITALS-R9 treats 768 px as a phone and 769 px as a desktop", () => {
    expect(buildPayload(lcp, "/", { width: 768 })?.device).toBe("celular");
    expect(buildPayload(lcp, "/", { width: 769 })?.device).toBe("escritorio");
  });

  it("VITALS-R9 reports the interaction target for INP and no element for TTFB", () => {
    const inp: VitalMetric = {
      name: "INP",
      value: 180,
      id: "v6-3",
      navigationType: "soft-navigation",
      attribution: { interactionTarget: "button.primary" },
    };
    expect(buildPayload(inp, "/start", { width: 390 })).toMatchObject({
      target: "button.primary",
      navigation_type: "",
    });
    const ttfb: VitalMetric = { ...lcp, name: "TTFB", value: 120, attribution: {} };
    expect(buildPayload(ttfb, "/", { width: 390 })).toMatchObject({ target: null });
    expect(buildPayload(ttfb, "/", { width: 390 })).not.toHaveProperty("lcp");
    expect(elementOf(ttfb)).toBeNull();
  });

  it("VITALS-R9 drops unknown or invalid metrics", () => {
    expect(buildPayload({ ...lcp, name: "FID" }, "/", { width: 390 })).toBeNull();
    expect(buildPayload({ ...lcp, value: Number.NaN }, "/", { width: 390 })).toBeNull();
    expect(buildPayload({ ...lcp, value: -1 }, "/", { width: 390 })).toBeNull();
    expect(VITAL_NAMES).toEqual(["LCP", "INP", "CLS", "FCP", "TTFB"]);
  });
});

describe("sendVital", () => {
  const payload = buildPayload(lcp, "/", { width: 390 })!;

  it("VITALS-R10 posts text/plain with keepalive and no credentials, so it needs no preflight", () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    sendVital(payload);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${API_URL}/api/v1/vitals`, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
    });
  });

  it("VITALS-R10 swallows network failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(() => sendVital(payload)).not.toThrow();
    await Promise.resolve();
  });

  it("VITALS-R10 swallows a missing fetch", () => {
    vi.stubGlobal("fetch", undefined);
    expect(() => sendVital(payload)).not.toThrow();
  });
});
