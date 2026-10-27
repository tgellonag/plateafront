// Run with PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-voting.mjs
// Uses a local Next dev server; all API traffic is mocked, never production data.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const browser = await chromium.launch();
const page = await browser.newPage();
const sessionID = "11111111-1111-4111-a111-111111111111";
const access = { session_id: sessionID, token: "a".repeat(64) };
const movies = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  title: `Movie ${i + 1}`,
  overview: "",
  year: 2026,
  runtime: 90,
  genre_ids: [],
  provider_ids: [],
  rating: 7,
  round: 1,
  position: i + 1,
  likes: 0,
  dislikes: 0,
  score: 0,
  match: false,
}));
const room = {
  session: {
    id: sessionID,
    status: "voting",
    round: 1,
    filters: {
      genre_ids: [],
      provider_ids: [],
      min_year: 1900,
      max_runtime: 300,
      movie_count: 5,
    },
    group_profile: "",
    chosen_movie_id: null,
  },
  me: { id: "me", name: "Me", is_host: true, progress: 0 },
  participants: [{ id: "me", name: "Me", is_host: true, progress: 0 }],
  movies,
  votes: [],
  invitation: null,
};
let gets = 0,
  posts = 0,
  postDuration = 0,
  socket,
  loseNextAck = false;
const posterRequests = new Set();
await page.addInitScript((access) => {
  sessionStorage.setItem(`platea-${access.session_id}`, JSON.stringify(access));
}, access);
await page.route("**/api/v1/**", async (route) => {
  const req = route.request();
  const path = new URL(req.url()).pathname;
  if (path === "/api/v1/providers") return route.fulfill({ json: { providers: [], stale: false } });
  if (path.endsWith("/poster")) {
    posterRequests.add(Number(path.split("/").at(-2)));
    return route.fulfill({ status: 404 });
  }
  if (path.endsWith("/resume")) return route.fulfill({ json: { ok: true } });
  if (req.method() === "GET") {
    gets++;
    const snapshot = structuredClone(room);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return route.fulfill({ json: snapshot });
  }
  if (path.endsWith("/vote")) {
    posts++;
    const start = performance.now();
    const vote = { participant_id: "me", ...req.postDataJSON() };
    await new Promise((resolve) => setTimeout(resolve, 800));
    const canonical = room.votes.find((v) => v.movie_id === vote.movie_id) ?? vote;
    if (!room.votes.includes(canonical)) room.votes.push(canonical);
    socket?.send(JSON.stringify({ type: process.env.BASELINE ? "changed" : "vote_changed" }));
    if (loseNextAck) {
      loseNextAck = false;
      await route.abort("connectionfailed");
    } else {
      // Reloads may abort the original HTTP request after the simulated commit.
      await route.fulfill({ json: { type: "vote_saved", round: 1, ...canonical } }).catch(() => {});
    }
    postDuration = performance.now() - start;
    return;
  }
  throw new Error(`Unexpected request: ${req.method()} ${path}`);
});
await page.routeWebSocket("**/ws", (ws) => {
  socket = ws;
});
try {
  await page.goto(`${process.env.FRONTEND_URL ?? "http://localhost:3000"}/room/${sessionID}`);
  await page.getByRole("heading", { name: "Movie 1", exact: true }).waitFor();
  await page.waitForTimeout(500);
  if (!process.env.BASELINE) {
    assert(posterRequests.has(2) && posterRequests.has(3), "Preload the next two posters");
    assert(!posterRequests.has(4), "Do not preload beyond the next two posters");
  }
  gets = 0;
  const start = performance.now();
  await page.getByRole("button", { name: "Me gusta", exact: true }).click();
  await page.getByRole("heading", { name: "Movie 2", exact: true }).waitFor();
  const clickToCard = performance.now() - start;
  await page.waitForTimeout(1200);
  console.log(
    JSON.stringify({
      mode: process.env.BASELINE ? "before" : "after",
      clickToCard,
      postDuration,
      posts,
      votingGETs: gets,
    }),
  );
  if (!process.env.BASELINE) {
    assert.equal(gets, 0, "Voting must not GET for an own vote");
    assert.equal(posts, 1);
    assert(clickToCard < 100, `Card took ${clickToCard}ms`);
    socket.send(JSON.stringify({ type: "vote_changed" }));
    await page.waitForTimeout(250);
    assert.equal(gets, 0, "Voting must ignore remote votes too");
    await page.getByRole("button", { name: "Sesión", exact: true }).click();
    await page.getByRole("heading", { name: "Ranking provisional" }).waitFor();
    await page.waitForTimeout(400);
    assert(gets > 0, "Opening Session must GET");
    gets = 0;
    socket.send(JSON.stringify({ type: "vote_changed" }));
    await page.waitForTimeout(300);
    assert.equal(gets, 1, "Session must refresh for remote votes");
    gets = 0;
    for (let i = 0; i < 10; i++) socket.send(JSON.stringify({ type: "vote_changed" }));
    await page.waitForTimeout(350);
    assert(gets > 0 && gets <= 2, `Coalesce notification bursts, got ${gets} GETs`);
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await page.getByRole("heading", { name: "Movie 2", exact: true }).waitFor();
    await page.getByRole("button", { name: "Me gusta", exact: true }).click();
    await page.getByRole("heading", { name: "Movie 3", exact: true }).waitFor();
    assert.equal(await page.getByText(/Guardando|Votos guardados|Ronda completada/).count(), 0);
    await page.getByRole("button", { name: "Sesión", exact: true }).click();
    await page.getByRole("heading", { name: "Ranking provisional" }).waitFor();
    await page.getByRole("button", { name: "Volver", exact: true }).click();
    await page.getByRole("heading", { name: "Movie 3", exact: true }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await page.getByRole("heading", { name: "Movie 3", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        JSON.parse(
          sessionStorage.getItem("platea-votes-11111111-1111-4111-a111-111111111111-me") ?? "[]",
        ).length === 0,
    );
    assert.equal(room.votes.filter((v) => v.movie_id === 2).length, 1);
    await page.getByRole("button", { name: "Me gusta", exact: true }).dblclick();
    await page.getByRole("heading", { name: "Movie 5", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        JSON.parse(
          sessionStorage.getItem("platea-votes-11111111-1111-4111-a111-111111111111-me") ?? "[]",
        ).length === 0,
    );
    assert.equal(room.votes.filter((v) => v.movie_id === 3).length, 1);
    assert.equal(
      room.votes.filter((v) => v.movie_id === 4).length,
      1,
      "Rapid clicks must advance successive cards without duplicate votes",
    );
    loseNextAck = true;
    await page.getByRole("button", { name: "Me gusta", exact: true }).click();
    await page.getByRole("heading", { name: "Esperando al anfitrión", exact: true }).waitFor();
    await page.waitForFunction(
      () =>
        JSON.parse(
          sessionStorage.getItem("platea-votes-11111111-1111-4111-a111-111111111111-me") ?? "[]",
        ).length === 0,
    );
    assert.equal(room.votes.filter((v) => v.movie_id === 5).length, 1);
    assert.deepEqual(await page.locator(".alert[role=alert]").allTextContents(), []);
    assert.equal(await page.getByText(/Guardando|Votos guardados|Ronda completada/).count(), 0);
    await page.waitForTimeout(1000);
    // Recover missed lifecycle changes on focus, then again via WebSocket after reopening.
    room.me.is_host = false;
    gets = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(300);
    assert(gets > 0, "Focus must reconcile missed notifications");
    gets = 0;
    socket.close();
    await page.waitForTimeout(1600);
    assert(gets > 0, "Reconnect must reconcile missed notifications");
    room.session.status = "closed";
    socket.send(JSON.stringify({ type: "changed" }));
    await page.getByRole("heading", { name: "Ranking", exact: true }).waitFor();
    console.log(
      "View-aware sync, pending reload/view switches, double-click, lost acknowledgement, focus/reconnect and close checks passed",
    );
  }
} finally {
  await browser.close();
}
