import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({
  configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/semantic"),
  server: { host: "127.0.0.1", port: 3037, strictPort: true, fs: { allow: [resolve(".")] } },
  resolve: { dedupe: ["react", "react-dom"], alias: { "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  oxc: { jsx: { runtime: "automatic" } },
  optimizeDeps: { entries: ["tests/browser-fixtures/local-rag-search.tsx"], include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "zod", "tesseract.js", "pdfjs-dist/legacy/build/pdf.mjs", "@huggingface/transformers"] },
  plugins: [{ name: "semantic-fixture", enforce: "pre", transform(code, id) {
    if (!id.replaceAll("\\", "/").split("?")[0].endsWith("/semantic.worker.ts")) return;
    return `const MemoryBase=WebAssembly.Memory; const observedMemories=[]; WebAssembly.Memory=class extends MemoryBase { constructor(options){ super(options); observedMemories.push(this); } }; const originalPost=self.postMessage.bind(self); self.postMessage=(message,...options)=>originalPost({...message,__semanticProbe:{ wasmLinearBytes:observedMemories.reduce((sum,memory)=>sum+memory.buffer.byteLength,0) }},...options);\n` + code;
  }, configureServer(server) { server.middlewares.use("/__semantic", (_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/local-rag-search.tsx"></script></html>');
  }); } }],
});
await server.listen();
console.log("Synthetic semantic fixture: http://127.0.0.1:3037/__semantic");
