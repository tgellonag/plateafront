// Backend simulado para medir la sala en Lighthouse CI: responde lo justo para que /room/[id] cargue
// sin el backend real, sin base de datos ni TMDB. Los datos son fijos y todo (incluidos los afiches)
// sale de este proceso, así la medición no depende de la red.
import http from "node:http";

// Debe coincidir con el id de la sala en lighthouserc.js y lighthouse/seed-room.cjs.
const ROOM_ID = "00000000-0000-4000-8000-000000000001";

const providers = [
  { provider_id: 8, provider_name: "Netflix" },
  { provider_id: 337, provider_name: "Disney Plus" },
  { provider_id: 119, provider_name: "Amazon Prime Video" },
];

const titles = [
  "La travesía del faro",
  "Ecos de verano",
  "El último tren a Valdivia",
  "Noche en la ciudad vieja",
  "Cartas desde el sur",
  "Los guardianes del bosque",
  "Un domingo cualquiera",
  "Piedra, papel y tijera",
];

const movies = titles.map((title, i) => ({
  id: 1000 + i,
  title,
  overview:
    "Una historia pensada para el grupo: una película de ejemplo con una sinopsis lo bastante larga " +
    "como para ocupar varias líneas en la tarjeta y que el diseño se mida con texto real.",
  year: 2015 + i,
  runtime: 90 + i * 5,
  genre_ids: [18, 35],
  provider_ids: [8, 337],
  rating: 7.5,
  round: 1,
  position: i,
  likes: 0,
  dislikes: 0,
  score: 0,
  match: false,
}));

const state = {
  session: {
    id: ROOM_ID,
    status: "voting",
    filters: { genre_ids: [], provider_ids: [8, 337], min_year: 2000, max_runtime: 180 },
    round: 1,
    chosen_movie_id: null,
  },
  me: { id: "p1", name: "Lighthouse", is_host: true, progress: 0 },
  participants: [
    { id: "p1", name: "Lighthouse", is_host: true, progress: 0 },
    { id: "p2", name: "Invitada", is_host: false, progress: 0 },
  ],
  movies,
  votes: [],
  invitation: null,
};

const poster = (id) => {
  const title = movies.find((m) => m.id === id)?.title ?? "Película";
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750">' +
    '<rect width="500" height="750" fill="#2b3a55"/>' +
    `<text x="250" y="375" fill="#fff" font-size="32" text-anchor="middle">${title}</text></svg>`
  );
};

const routes = [
  ["GET", /^\/api\/v1\/providers$/, () => ({ providers, stale: false })],
  ["POST", /^\/api\/v1\/sessions\/[^/]+\/resume$/, () => ({ ok: true })],
  ["GET", /^\/api\/v1\/sessions\/[^/]+$/, () => state],
  ["GET", /^\/api\/v1\/sessions\/[^/]+\/movies\/\d+\/trailer$/, () => ({ trailer: null })],
];

export function createMockApi() {
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://localhost");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.writeHead(204).end();
    if (req.method === "POST" && pathname === "/api/v1/vitals") return res.writeHead(204).end();
    const image = pathname.match(/^\/api\/v1\/movies\/(\d+)\/poster$/);
    if (req.method === "GET" && image) {
      res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=3600" });
      return res.end(poster(Number(image[1])));
    }
    const route = routes.find(
      ([method, pattern]) => method === req.method && pattern.test(pathname),
    );
    res.writeHead(route ? 200 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify(route ? route[2]() : { error: "No encontrado" }));
  });
  // La app intenta abrir un WebSocket para las actualizaciones en vivo; aquí no hay: se rechaza.
  server.on("upgrade", (_req, socket) => socket.destroy());
  return server;
}
