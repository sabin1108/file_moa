import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/tests/server/sample-quota.checks.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
