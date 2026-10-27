// Local integration smoke: creates an excluded demo room against the running API.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-voting-live.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const api = process.env.API_URL ?? "http://localhost:8080";
const frontend = process.env.FRONTEND_URL ?? "http://localhost:3000";
for (const url of [api, frontend])
  assert(["localhost", "127.0.0.1"].includes(new URL(url).hostname), "Local services only");
async function request(path, access, body) {
  const response = await fetch(api + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert(response.ok, `${response.status} ${JSON.stringify(data)}`);
  return data;
}
// Catches the old container's strict decoder before creating any test data.
const probe = await fetch(`${api}/api/v1/sessions/00000000-0000-4000-a000-000000000000/vote`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ round: 1, movie_id: 1, liked: true }),
});
assert.equal(probe.status, 404, "Running backend is stale: rebuild the API container");
const host = await request("/api/v1/sessions", null, { name: "Voting smoke host", is_test: true });
const path = `/api/v1/sessions/${host.session_id}`;
let guest;
const browser = await chromium.launch();
try {
  const lobby = await request(path, host);
  guest = await request("/api/v1/join", null, {
    name: "Voting smoke guest",
    code: lobby.invitation.code,
  });
  await request(`${path}/filters`, host, { ...lobby.session.filters, movie_count: 5 });
  await request(`${path}/start`, host, {});
  const started = await request(path, host);
  const first = started.movies.toSorted((a, b) => a.position - b.position)[0];
  const pending = {
    round: started.session.round,
    participant_id: started.me.id,
    movie_id: first.id,
    liked: true,
    error: "Datos inválidos. Reintenta o descarta el voto.",
  };
  const page = await browser.newPage();
  await page.addInitScript(
    ({ access, pending }) => {
      sessionStorage.setItem(`platea-${access.session_id}`, JSON.stringify(access));
      sessionStorage.setItem(
        `platea-votes-${access.session_id}-${pending.participant_id}`,
        JSON.stringify([pending]),
      );
    },
    { access: host, pending },
  );
  await page.goto(`${frontend}/room/${host.session_id}`);
  await page.locator(".movie-card").waitFor();
  const recovery = page.waitForResponse((res) => res.url() === `${api}${path}/vote`);
  assert.equal(await page.getByText("Datos inválidos", { exact: false }).count(), 0);
  const disconnected = page.getByRole("button", {
    name: "Sin conexión. Reintentar envío de votos",
    exact: true,
  });
  assert.equal(await disconnected.locator("xpath=..").getAttribute("class"), "room-status");
  assert.equal(await disconnected.textContent(), "");
  await disconnected.click();
  assert.equal((await recovery).status(), 200, "Previously rejected pending votes must recover");
  await page.waitForFunction(() => document.querySelectorAll(".alert[role=alert]").length === 0);
  await disconnected.waitFor({ state: "detached" });
  await page.waitForTimeout(500);
  let roomGETs = 0;
  page.on("request", (req) => {
    if (req.method() === "GET" && req.url() === api + path) roomGETs++;
  });
  const response = page.waitForResponse((res) => res.url() === `${api}${path}/vote`);
  await page.getByRole("button", { name: "Me gusta", exact: true }).click();
  const saved = await response;
  assert.equal(saved.status(), 200);
  const receipt = await saved.json();
  assert.equal(receipt.type, "vote_saved");
  assert.equal(receipt.round, 1);
  await page.waitForFunction(() =>
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("platea-votes-"))
      .every((key) => JSON.parse(sessionStorage.getItem(key)).length === 0),
  );
  await page.waitForTimeout(300);
  assert.equal(roomGETs, 0);
  assert.deepEqual(await page.locator(".alert[role=alert]").allTextContents(), []);
  const state = await request(path, host);
  assert(
    state.votes.some(
      (v) =>
        v.participant_id === receipt.participant_id &&
        v.movie_id === receipt.movie_id &&
        v.liked === true,
    ),
  );
  console.log(
    "Live browser → running API → Postgres: rejected pending vote recovered, new vote saved, outbox cleared, zero vote-triggered GETs",
  );
} finally {
  await browser.close();
  if (guest) await request(`${path}/leave`, guest, {});
  await request(`${path}/leave`, host, {});
}
