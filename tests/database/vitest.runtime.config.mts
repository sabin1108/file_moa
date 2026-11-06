import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/tests/server/database-runtime.checks.ts", "apps/web/tests/server/auth-email.checks.ts", "apps/web/tests/server/auth-social.checks.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
