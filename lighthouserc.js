// Lighthouse CI: prueba de laboratorio (una carga simulada, con emulación de celular) de la pantalla de
// entrada y de la votación en una sala. No necesita el backend real: lighthouse/serve.mjs levanta
// la app junto a un backend simulado. Ver la sección «Lighthouse CI» del README.
module.exports = {
  ci: {
    collect: {
      startServerCommand: "node lighthouse/serve.mjs",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,
      url: [
        "http://localhost:3000/",
        // Sala simulada (mock-api.mjs); seed-room.cjs deja guardado el acceso a ella.
        "http://localhost:3000/room/00000000-0000-4000-8000-000000000001",
      ],
      puppeteerScript: "./lighthouse/seed-room.cjs",
      // puppeteer-core no trae Chrome: en el CI se define CHROME_PATH (ver el workflow).
      chromePath: process.env.CHROME_PATH,
      // Con puppeteerScript, las banderas de Chrome van aquí y no en settings.chromeFlags.
      // Los runners de GitHub Actions no permiten el sandbox de Chrome.
      puppeteerLaunchOptions: { args: ["--no-sandbox"] },
      settings: {
        onlyCategories: ["performance"],
      },
    },
    assert: {
      // Se compara la ejecución mediana de las tres.
      aggregationMethod: "median-run",
      assertions: {
        // Por ahora solo avisan ("warn") y no bloquean el PR.
        // Para que bloqueen, cambiar "warn" por "error".
        "categories:performance": ["warn", { minScore: 0.8 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["warn", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["warn", { maxNumericValue: 300 }],
      },
    },
    upload: {
      // Los reportes se guardan en disco; el workflow los sube como artefacto de GitHub Actions.
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
