import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/tests/server/openai-live.checks.ts"],
    testTimeout: 40_000,
    hookTimeout: 30_000,
    retry: 0
  }
});
