import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/server/database-live.checks.ts"],
    testTimeout: 30_000,
  },
});
