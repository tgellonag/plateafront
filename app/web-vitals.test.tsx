// @vitest-environment jsdom
import { renderHook, render, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebVitals } from "./web-vitals";
import { API_URL } from "@/lib/api";
import { resetLive, useLiveVitals } from "@/lib/vitals-live";

type Handler = (metric: unknown) => void;
const registered = vi.hoisted(() => ({}) as Record<string, { cb: Handler; live: boolean }[]>);

vi.mock("web-vitals/attribution", () => {
  const on = (name: string) => (cb: Handler, opts?: { reportAllChanges?: boolean }) => {
    (registered[name] ??= []).push({ cb, live: !!opts?.reportAllChanges });
  };
  return {
    onLCP: on("LCP"),
    onINP: on("INP"),
    onCLS: on("CLS"),
    onFCP: on("FCP"),
    onTTFB: on("TTFB"),
  };
});

const lcpMetric = {
  name: "LCP",
  value: 1800.4,
  id: "v6-1",
  navigationType: "navigate",
  attribution: {
    target: "html>body>main>h1",
    timeToFirstByte: 100,
    resourceLoadDelay: 10,
    resourceLoadDuration: 20,
    elementRenderDelay: 30,
  },
};
const inpMetric = {
  name: "INP",
  value: 120,
  id: "v6-2",
  navigationType: "navigate",
  attribution: { interactionTarget: "button.primary" },
};

const final = (name: string) => registered[name].find((entry) => !entry.live)!.cb;
const live = (name: string) => registered[name].find((entry) => entry.live)!.cb;
const sent = (fetch: ReturnType<typeof vi.fn>) =>
  fetch.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

async function mount(path: string) {
  history.replaceState({}, "", path);
  const view = render(<WebVitals />);
  await vi.waitFor(() => expect(registered.LCP).toBeDefined());
  return view;
}

let fetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  for (const key of Object.keys(registered)) delete registered[key];
  resetLive();
  fetch = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("WebVitals", () => {
  it("VITALS-R11 registers a final and a live observer for each metric", async () => {
    await mount("/");
    for (const name of ["LCP", "INP", "CLS", "FCP", "TTFB"]) {
      expect(registered[name].map((entry) => entry.live).sort()).toEqual([false, true]);
    }
  });

  it("VITALS-R11 sends the final value with the entry screen, never the room id", async () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE", "abc1234");
    await mount("/room/3f2c9d1e-0000-4000-a000-000000000000");
    act(() => final("LCP")(lcpMetric));
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${API_URL}/api/v1/vitals`);
    expect(sent(fetch)[0]).toMatchObject({
      name: "LCP",
      value: 1800,
      page: "/room/[id]",
      release: "abc1234",
      target: "html>body>main>h1",
    });
    expect(JSON.stringify(sent(fetch))).not.toContain("3f2c9d1e");
  });

  it("VITALS-R11 attributes LCP to the entry screen but INP to the screen where it is reported", async () => {
    await mount("/");
    history.pushState({}, "", "/room/abc");
    act(() => {
      final("LCP")(lcpMetric);
      final("INP")(inpMetric);
    });
    const [lcp, inp] = sent(fetch);
    expect(lcp.page).toBe("/");
    expect(inp.page).toBe("/room/[id]");
    expect(inp.target).toBe("button.primary");
  });

  it("VITALS-R11 does not send from /vitals or /metrics, nor INP reported after leaving for them", async () => {
    await mount("/vitals");
    act(() => final("LCP")(lcpMetric));
    expect(fetch).not.toHaveBeenCalled();
    history.pushState({}, "", "/");
    act(() => final("INP")(inpMetric));
    expect(sent(fetch)).toHaveLength(1);
    history.pushState({}, "", "/metrics");
    act(() => final("INP")(inpMetric));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("VITALS-R11 ignores metrics the backend does not know", async () => {
    await mount("/");
    act(() => final("LCP")({ ...lcpMetric, name: "FID" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("VITALS-R12 publishes every change in live, even on pages that are not reported", async () => {
    await mount("/vitals");
    const { result } = renderHook(() => useLiveVitals());
    expect(result.current).toEqual({});
    act(() => live("LCP")(lcpMetric));
    expect(result.current.LCP).toEqual({
      value: 1800.4,
      rating: "good",
      target: "html>body>main>h1",
      parts: {
        timeToFirstByte: 100,
        resourceLoadDelay: 10,
        resourceLoadDuration: 20,
        elementRenderDelay: 30,
      },
    });
    act(() => live("INP")({ ...inpMetric, value: 600 }));
    expect(result.current.INP).toMatchObject({ rating: "poor", target: "button.primary" });
    act(() => live("LCP")({ ...lcpMetric, name: "FID" }));
    expect(result.current.LCP?.value).toBe(1800.4);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("VITALS-R11 registers nothing if it unmounts before web-vitals loads, and ignores late callbacks", async () => {
    history.replaceState({}, "", "/");
    const early = render(<WebVitals />);
    early.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registered.LCP).toBeUndefined();

    const view = await mount("/");
    const callback = final("LCP");
    view.unmount();
    callback(lcpMetric);
    live("LCP")(lcpMetric);
    expect(fetch).not.toHaveBeenCalled();
  });
});
