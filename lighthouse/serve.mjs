// Levanta el backend simulado (puerto 8080, la URL por defecto de la app) y `next start`.
// Lighthouse CI usa este script como startServerCommand y detiene ambos al terminar.
import { spawn } from "node:child_process";
import { createMockApi } from "./mock-api.mjs";

const api = createMockApi();
api.listen(8080, () => console.log("Backend simulado en http://localhost:8080"));

const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start"], {
  stdio: "inherit",
});

const stop = () => {
  next.kill();
  api.close();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
next.on("exit", (code) => process.exit(code ?? 0));
