import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["apps/web/tests/server/chat-stream-session-live.checks.ts"], testTimeout: 30_000, retry: 0 } });
