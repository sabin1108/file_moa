import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({
  configFile: false,
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: {
    "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
    "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx")
  } },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{ name: "chat-first-design-preview", configureServer(server) {
    server.middlewares.use("/__chat-first", (_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/chat-first-design.tsx"></script></html>');
    });
  } }]
});
await server.listen();
console.log(`http://127.0.0.1:${server.httpServer.address().port}/__chat-first`);
