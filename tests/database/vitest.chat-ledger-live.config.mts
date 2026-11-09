import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/tests/server/chat-ledger-live.checks.ts"],
    retry: 0,
    testTimeout: 45_000,
    hookTimeout: 30_000,
  },
});
