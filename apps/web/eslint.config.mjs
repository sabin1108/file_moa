import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { serverBoundaryConfig } from "./tooling/server-boundary.mjs";
import { featureBoundaryConfig } from "./tooling/feature-boundary.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...serverBoundaryConfig,
  featureBoundaryConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);

