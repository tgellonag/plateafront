// Script de Puppeteer de Lighthouse CI: guarda en sessionStorage el acceso a la sala simulada, como lo
// haría la app al entrar, antes de que cargue /room/[id]. Sin esto mostraría la pantalla de bienvenida
// en lugar de la votación. sessionStorage es por pestaña, así que se inyecta en cada pestaña nueva
// (Lighthouse mide en una pestaña propia) antes de que ejecute cualquier script de la página.
// El id de la sala debe coincidir con el de lighthouse/mock-api.mjs.
const ROOM_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_TOKEN = "a".repeat(64);

module.exports = async (browser) => {
  browser.on("targetcreated", async (target) => {
    if (target.type() !== "page") return;
    const page = await target.page();
    await page?.evaluateOnNewDocument(
      (id, token) => {
        if (location.origin !== "http://localhost:3000" || !location.pathname.startsWith("/room/"))
          return;
        const access = JSON.stringify({ session_id: id, token });
        sessionStorage.setItem(`platea-${id}`, access);
        sessionStorage.setItem("platea-recent", access);
        sessionStorage.setItem("platea-last", id);
      },
      ROOM_ID,
      ROOM_TOKEN,
    );
  });
};
