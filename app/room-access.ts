import { request, type Access } from "@/lib/api";

export async function resumeAccess(saved: Access) {
  await request(`/api/v1/sessions/${saved.session_id}/resume`, saved.token, {});
  return saved;
}

export function savedRoomAccess(pathname: string): Access | null {
  const [, route, roomID] = pathname.split("/");
  const id = route === "room" ? roomID : sessionStorage.getItem("platea-last");
  const saved = id && sessionStorage.getItem(`platea-${id}`);
  return saved ? JSON.parse(saved) : null;
}

export function saveRoomAccess(access: Access) {
  const saved = JSON.stringify(access);
  sessionStorage.setItem(`platea-${access.session_id}`, saved);
  sessionStorage.setItem("platea-recent", saved);
  sessionStorage.setItem("platea-last", access.session_id);
}

export function enterRoom(
  create: boolean,
  { name, code }: { name: string; code: string },
  recentAccess: Access | null,
) {
  if (create) return request<Access>("/api/v1/sessions", undefined, { name });

  const tokens = new Set<string>();
  if (recentAccess) tokens.add(recentAccess.token);
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (!/^platea-[a-f0-9-]{36}$/.test(key)) continue;
      try {
        const saved = JSON.parse(sessionStorage.getItem(key) ?? "null") as Access | null;
        if (saved?.token?.length === 64) tokens.add(saved.token);
      } catch {
        /* Ignorar registros locales inválidos. */
      }
    }
  } catch {
    /* Se puede ingresar sin almacenamiento local. */
  }
  return request<Access>("/api/v1/join", undefined, { name, code, tokens: [...tokens].slice(-64) });
}
