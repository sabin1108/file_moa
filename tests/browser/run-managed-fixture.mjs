import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const require = createRequire(import.meta.resolve("vitest"));
const mode = process.argv[3] ?? "managed";
const script = {
  copy: "tests/browser/check-copy-execution.mjs",
  managed: "tests/browser/check-managed-files-ui.mjs",
  restore: "tests/browser/check-recovery-restore-ui.mjs",
  "restore-resume": "tests/browser/check-restore-resume.mjs",
}[mode];
if (typeof script !== "string") throw Error("Unknown managed fixture mode");
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/managed-completion"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: {
    "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "@personal-ai/domain": resolve("packages/domain/src/index.ts"),
  } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { include: ["react", "react-dom/client", "react/jsx-runtime", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs"] },
  plugins: [{ name: "managed-fixture", configureServer(server) {
    server.middlewares.use("/files", (_req, res) => {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-organization.tsx"></script></html>');
    });
  } }],
});
await server.listen();
try {
  const code = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [script, `http://127.0.0.1:${server.httpServer.address().port}`, process.argv[2] ?? "docs/verification/completion-five/managed-browser", ...(mode === "copy" ? ["--quick-guard"] : [])], { stdio: "inherit", windowsHide: true });
    child.once("error", reject); child.once("exit", code => done(code ?? 1));
  });
  if (code) process.exitCode = code;
} finally { await server.close(); }
