import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["apps/web/tests/server/live-review.checks.ts"], testTimeout: 60000, hookTimeout: 30000 } });
