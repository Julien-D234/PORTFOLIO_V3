import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Chaque fichier lance sa propre base PGlite (WASM) + Argon2 (64 MiB) : trop de workers
    // en parallèle font expirer les beforeAll. On borne la concurrence et on laisse de la marge.
    maxWorkers: 3,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
