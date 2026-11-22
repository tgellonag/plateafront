// Lighthouse CI: prueba de laboratorio (una carga simulada, con emulación de celular) de las pantallas
// estáticas y sin estado. No necesita el backend. Ver la sección «Lighthouse CI» del README.
module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start",
      startServerReadyPattern: "Ready in",
      startServerReadyTimeout: 60000,
      numberOfRuns: 3,
      url: [
        "http://localhost:3000/",
        "http://localhost:3000/start",
        "http://localhost:3000/vitals",
      ],
      settings: {
        // Los runners de GitHub Actions no permiten el sandbox de Chrome.
        chromeFlags: "--no-sandbox",
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
