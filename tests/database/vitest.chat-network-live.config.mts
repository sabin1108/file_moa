import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/tests/server/chat-network-latency-live.checks.ts"],
    retry: 0,
    testTimeout: 30_000
  }
});
