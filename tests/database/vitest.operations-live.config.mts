import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["apps/web/tests/server/operations-live.checks.ts"], testTimeout: 30_000, retry: 0 } });
