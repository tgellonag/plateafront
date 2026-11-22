import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      thresholds: { statements: 75, branches: 75, functions: 75, lines: 75 },
    },
  },
});
