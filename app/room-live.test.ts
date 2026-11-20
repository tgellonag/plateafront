import { afterEach, describe, expect, it, vi } from "vitest";
import type { State } from "@/lib/api";
import { createRoomRefresher, watchRoom } from "./room-live";

const state: State = {
  session: {
    id: "room-1",
    status: "open",
    filters: { genre_ids: [], provider_ids: [], min_year: 2000, max_runtime: 120 },
    round: 0,
    chosen_movie_id: null,
  },
  me: { id: "host", name: "Ana", is_host: true, progress: 0 },
  participants: [],
  movies: [],
  votes: [],
  invitation: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("room refresh", () => {
  it("RT-R6 coalesces a burst into one active and one follow-up request", async () => {
    const refresher = createRoomRefresher();
    const first = deferred<State>();
    const second = { ...state, session: { ...state.session, round: 1 } };
    const load = vi.fn(() => Promise.resolve(second)).mockReturnValueOnce(first.promise);
    const apply = vi.fn();
    const onError = vi.fn();
    const refresh = () => refresher.refresh(load, apply, onError, () => true);

    const inFlight = refresh();
    expect(refresh()).toBe(inFlight);
    expect(refresh()).toBe(inFlight);
    expect(load).toHaveBeenCalledOnce();

    first.resolve(state);
    await inFlight;

    expect(load).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls).toEqual([[state], [second]]);
    expect(onError).not.toHaveBeenCalled();
  });

  it("RT-R6 discards an old room response without interrupting a new refresh", async () => {
    const refresher = createRoomRefresher();
    const old = deferred<State>();
    const next = deferred<State>();
    const oldApply = vi.fn();
    const newApply = vi.fn();
    const onError = vi.fn();
    let oldAccess = true;
    const oldTask = refresher.refresh(
      () => old.promise,
      oldApply,
      onError,
      () => oldAccess,
    );

    oldAccess = false;
    refresher.reset();
    const load = vi.fn(() => next.promise);
    const refresh = () => refresher.refresh(load, newApply, onError, () => true);
    const newTask = refresh();
    old.resolve(state);
    await oldTask;

    expect(oldApply).not.toHaveBeenCalled();
    expect(refresh()).toBe(newTask);
    expect(load).toHaveBeenCalledOnce();
    next.resolve(state);
    await newTask;
    expect(load).toHaveBeenCalledTimes(2);
    expect(newApply).toHaveBeenCalledWith(state);
    expect(onError).not.toHaveBeenCalled();
  });

  it("RT-R6 reports the current failure and ignores errors from an old room", async () => {
    const refresher = createRoomRefresher();
    const old = deferred<State>();
    const apply = vi.fn();
    const onError = vi.fn();
    let oldAccess = true;
    const oldTask = refresher.refresh(
      () => old.promise,
      apply,
      onError,
      () => oldAccess,
    );

    oldAccess = false;
    refresher.reset();
    const error = new Error("La API no responde");
    await refresher.refresh(
      () => Promise.reject(error),
      apply,
      onError,
      () => true,
    );
    old.reject(new Error("Error de otra sala"));
    await oldTask;

    expect(onError).toHaveBeenCalledExactlyOnceWith(error);
    expect(apply).not.toHaveBeenCalled();
    await refresher.refresh(
      () => Promise.resolve(state),
      apply,
      onError,
      () => true,
    );
    expect(apply).toHaveBeenCalledExactlyOnceWith(state);
  });
});

function roomWatcher() {
  const sockets: Socket[] = [];
  class Socket {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number }) => void;
    onerror?: () => void;
    send = vi.fn();
    close = vi.fn();

    constructor(readonly url: string) {
      sockets.push(this);
    }
  }
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("WebSocket", Socket);
  let ranking = false;
  let current = true;
  const refresh = vi.fn(async () => {});
  const invalidateAccess = vi.fn();
  const stop = watchRoom({
    access: { session_id: "room-1", token: "room-token" },
    refresh,
    invalidateAccess,
    isCurrent: () => current,
    isRanking: () => ranking,
  });
  return {
    sockets,
    window,
    document,
    refresh,
    invalidateAccess,
    stop,
    showRanking: () => {
      ranking = true;
    },
    changeAccess: () => {
      current = false;
    },
  };
}

describe("room WebSocket", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("RT-R4 authenticates on open and refreshes after visible or relevant events", () => {
    const watcher = roomWatcher();
    const [socket] = watcher.sockets;
    expect(socket.url).toMatch(/^wss?:\/\/[^?]+\/api\/v1\/sessions\/room-1\/ws$/);

    socket.onopen?.();
    expect(socket.send).toHaveBeenCalledExactlyOnceWith('{"token":"room-token"}');
    expect(watcher.refresh).toHaveBeenCalledTimes(1);

    socket.onmessage?.({ data: '{"type":"vote_changed"}' });
    expect(watcher.refresh).toHaveBeenCalledTimes(1);
    watcher.showRanking();
    socket.onmessage?.({ data: '{"type":"vote_changed"}' });
    socket.onmessage?.({ data: '{"type":"changed"}' });
    expect(watcher.refresh).toHaveBeenCalledTimes(3);

    watcher.document.hidden = true;
    watcher.window.dispatchEvent(new Event("focus"));
    expect(watcher.refresh).toHaveBeenCalledTimes(3);
    watcher.document.hidden = false;
    watcher.document.dispatchEvent(new Event("visibilitychange"));
    expect(watcher.refresh).toHaveBeenCalledTimes(4);
    watcher.stop();
  });

  it("RT-R5 backs off after repeated disconnections and resets the delay after a connection", () => {
    vi.useFakeTimers();
    const watcher = roomWatcher();

    watcher.sockets[0].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(999);
    expect(watcher.sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(watcher.sockets).toHaveLength(2);

    watcher.sockets[1].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1999);
    expect(watcher.sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(watcher.sockets).toHaveLength(3);

    watcher.sockets[2].onopen?.();
    watcher.sockets[2].onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    expect(watcher.sockets).toHaveLength(4);
    watcher.stop();
  });

  it("RT-R5 invalidates a revoked room and never schedules a reconnect", () => {
    vi.useFakeTimers();
    const watcher = roomWatcher();
    watcher.sockets[0].onclose?.({ code: 1008 });
    vi.runAllTimers();

    expect(watcher.invalidateAccess).toHaveBeenCalledOnce();
    expect(watcher.sockets).toHaveLength(1);
    watcher.stop();
  });

  it("RT-R5 cancels reconnects, ignores obsolete callbacks and removes the browser listeners", () => {
    vi.useFakeTimers();
    const watcher = roomWatcher();
    const [socket] = watcher.sockets;
    const removeFocus = vi.spyOn(watcher.window, "removeEventListener");
    const removeVisibility = vi.spyOn(watcher.document, "removeEventListener");
    socket.onerror?.();
    expect(socket.close).toHaveBeenCalledOnce();
    socket.onclose?.({ code: 1006 });

    watcher.changeAccess();
    socket.onopen?.();
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledTimes(2);
    watcher.stop();
    expect(removeFocus).toHaveBeenCalledExactlyOnceWith("focus", expect.any(Function));
    expect(removeVisibility).toHaveBeenCalledExactlyOnceWith(
      "visibilitychange",
      expect.any(Function),
    );

    socket.onmessage?.({ data: '{"type":"changed"}' });
    socket.onclose?.({ code: 1008 });
    watcher.window.dispatchEvent(new Event("focus"));
    watcher.document.dispatchEvent(new Event("visibilitychange"));
    vi.runAllTimers();
    expect(watcher.sockets).toHaveLength(1);
    expect(watcher.refresh).not.toHaveBeenCalled();
    expect(watcher.invalidateAccess).not.toHaveBeenCalled();
  });
});
