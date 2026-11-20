import { API_URL, type Access, type State } from "@/lib/api";
import { shouldRefreshRoom } from "./vote-queue";

export function createRoomRefresher() {
  let refreshing: Promise<void> | null = null;
  let refreshPending = false;

  return {
    reset() {
      refreshing = null;
      refreshPending = false;
    },
    refresh(
      load: () => Promise<State>,
      apply: (state: State) => void,
      onError: (error: unknown) => void,
      isCurrent: () => boolean,
    ) {
      if (refreshing) {
        refreshPending = true;
        return refreshing;
      }
      const task = (async () => {
        try {
          do {
            refreshPending = false;
            const next = await load();
            if (!isCurrent()) return;
            apply(next);
          } while (refreshPending);
        } catch (error) {
          if (isCurrent()) onError(error);
        }
      })().finally(() => {
        if (refreshing === task) refreshing = null;
      });
      refreshing = task;
      return task;
    },
  };
}

export function watchRoom({
  access,
  refresh,
  invalidateAccess,
  isCurrent,
  isRanking,
}: {
  access: Access;
  refresh: () => Promise<void>;
  invalidateAccess: () => void;
  isCurrent: () => boolean;
  isRanking: () => boolean;
}) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout>;
  let delay = 1000;
  const active = () => !stopped && isCurrent();

  function connect() {
    const connection = new WebSocket(
      `${API_URL.replace(/^http/, "ws")}/api/v1/sessions/${access.session_id}/ws`,
    );
    socket = connection;
    connection.onopen = () => {
      if (!active()) {
        connection.close();
        return;
      }
      connection.send(JSON.stringify({ token: access.token }));
      delay = 1000;
      void refresh();
    };
    connection.onmessage = (event) => {
      if (active() && shouldRefreshRoom(event.data, isRanking())) void refresh();
    };
    connection.onclose = (event) => {
      if (!active()) return;
      if (event.code === 1008) {
        invalidateAccess();
        return;
      }
      timer = setTimeout(connect, delay);
      delay = Math.min(delay * 2, 30000);
    };
    connection.onerror = () => connection.close();
  }
  connect();

  const focus = () => {
    if (active() && !document.hidden) void refresh();
  };
  // iOS puede suspender el socket y volver a la pestaña sin emitir focus.
  window.addEventListener("focus", focus);
  document.addEventListener("visibilitychange", focus);

  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
    window.removeEventListener("focus", focus);
    document.removeEventListener("visibilitychange", focus);
  };
}
