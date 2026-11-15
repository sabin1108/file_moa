import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire(import.meta.resolve("vitest"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
await build({ configFile: false, logLevel: "error", build: { lib: { entry: resolve("apps/web/tests/browser-fixtures/search-strengthening.ts"), name: "SearchVerification", formats: ["iife"], fileName: () => "verification.js" }, outDir: resolve(process.argv[2] ?? ".omx/verification/search-rag-strengthening-20261115/bundle"), emptyOutDir: false } });
