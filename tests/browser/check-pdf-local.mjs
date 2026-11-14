import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? "docs/verification/workspace-nine/browser");

mkdirSync(output, { recursive: true });

const server = await createServer({
  configFile: false,
  root: resolve("apps/web"),
  logLevel: "error",
  cacheDir: resolve(".omx/browser-cache/pdf"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  plugins: [{
    name: "pdf-check",
    configureServer(server) {
      server.middlewares.use("/__pdf", (_request, response) => {
        response.setHeader("content-type", "text/html");
        response.setHeader(
          "content-security-policy",
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; worker-src 'self' blob:; connect-src 'self' ws:; font-src 'none'; img-src 'none'"
        );
        response.end('<html><body><script type="module">import { LocalTextIndex } from "/src/features/local-folders/search/documents/local-text-index.ts";import { createCopyHasher } from "/src/features/local-folders/content/copy-hash.ts";window.Index=LocalTextIndex;window.readPdf=async bytes=>{const reader=createCopyHasher();try{return await reader.readText(new File([new Uint8Array(bytes)],"sample.pdf"),"HelloPDF");}finally{reader.dispose();}};</script></body></html>');
      });
    }
  }]
});

await server.listen();

const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });

function fixturePdf(pages, text) {
  const stream = `BT /F1 1 Tf 0 100 Td (${text}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${index + 5} 0 R`).join(" ")}] /Count ${pages} >>`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, ...Array.from(
    { length: pages },
    () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 3000000 200] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>'
  )];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xref = pdf.length;

  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  return [...new TextEncoder().encode(pdf)];
}

try {
  const page = await browser.newPage({ width: 900, height: 700 });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const requests = [];
  const track = session => browser.on(session, "Network.requestWillBeSent", event => requests.push(event.request.url));

  track(page.sessionId);
  browser.on(page.sessionId, "Target.attachedToTarget", event => {
    track(event.sessionId);
    void browser.send("Network.enable", {}, event.sessionId).catch(() => undefined);
    void browser.send(
      "Target.setAutoAttach",
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
      event.sessionId
    ).catch(() => undefined);
  });
  await page.send("Network.enable");
  await page.send(
    "Target.setAutoAttach",
    { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }
  );
  await page.goto(`${origin}/__pdf`, { settleMs: 1000 });

  const result = await page.eval(async () => {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Length 39 >>\nstream\nBT /F1 12 Tf 20 100 Td (HelloPDF) Tj ET\nendstream'];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    for (let i = 0; i < objects.length; i++) {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xref = pdf.length;

    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    try {
      return { value: await window.readPdf([...new TextEncoder().encode(pdf)]) };
    }
    catch (error) {
      return { error: String(error), stack: error.stack };
    }
  });

  writeFileSync(resolve(output, "pdf-local.json"), JSON.stringify(result, null, 2));
  assert.ok(!result.error, result.error);
  assert.ok(result.value.fullText.includes("HelloPDF"));
  assert.deepEqual(result.value.pdf, { pages: 1, complete: true });
  assert.ok(result.value.size > 100);

  const boundaries = [];

  for (const [name, bytes, expected] of [
    ["no-text", fixturePdf(1, ""), "pdf-no-text"],
    ["damaged", [...new TextEncoder().encode("%PDF-1.4\ninvalid")], "pdf-invalid"],
    ["51-pages", fixturePdf(51, "PageEvidence"), null],
    ["character-limit", fixturePdf(1, "a".repeat(200_001)), null],
  ]) {
    const sample = await page.eval(async bytes => {
      const started = performance.now();

      try {
        const value = await window.readPdf(bytes);

        return {
          pdf: value.pdf,
          textLength: value.fullText.length,
          lastPageIncluded: value.fullText.includes("[51쪽]"),
          elapsedMs: Math.round(performance.now() - started)
        };
      } catch (error) {
        return { error: error.message, elapsedMs: Math.round(performance.now() - started) };
      }
    }, bytes);

    if (expected) assert.equal(sample.error, expected);
    else {
      assert.equal(sample.pdf.complete, false);
      assert.equal(sample.lastPageIncluded, false);
    }

    if (name === "51-pages") assert.equal(sample.pdf.pages, 51);

    if (name === "character-limit") assert.equal(sample.textLength, 200_005);

    boundaries.push({ name, ...sample });
  }

  const sizeBoundary = await page.eval(async () => {
    const { readSourceFilePreview } = await import("/src/features/local-folders/documents/preview/source-file-preview.ts");
    const file = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "oversize.pdf");
    let bodyRead = false;

    file.arrayBuffer = async () => {
      bodyRead = true;

      throw new Error("unexpected-read");
    };

    const root = {
      queryPermission: async () => "granted",
      getFileHandle: async name => {
        if (name !== file.name) throw new DOMException("No marker", "NotFoundError");

        return { getFile: async () => file };
      }
    };

    try {
      await readSourceFilePreview(root, [file.name], () => { });

      return { error: null, bodyRead };
    }
    catch (error) {
      return { error: error.message, bodyRead };
    }
  });

  assert.deepEqual(sizeBoundary, { error: "too-large", bodyRead: false });

  const cache = await page.eval(async () => {
    const index = new window.Index("pdf-index-fixture");
    const a = { owner: "a", workspace: "w", connection: "stable-root-a" };
    const key = { ...a, path: ["notes.txt"], hash: "one", parserVersion: 2 };

    await index.put(key, "first text");
    await index.put({ ...key, hash: "two" }, "changed text");

    const updated = await index.search(a, "text");
    const isolated = await index.search({ ...a, connection: "stable-root-b" }, "text");
    let revoked = false;

    try {
      await index.put({ ...key, path: ["revoked.txt"] }, "private", () => {
        throw new Error("revoked");
      });
    } catch {
      revoked = true;
    }

    await index.retain(a, []);

    return {
      updated: updated.map(item => [item.hash, item.text]),
      isolated,
      revoked,
      remaining: await index.search(a, "")
    };
  });

  assert.deepEqual(cache.updated, [["two", "changed text"]]);
  assert.equal(cache.isolated.length, 0);
  assert.ok(cache.revoked);
  assert.equal(cache.remaining.length, 0);
  assert.ok(
    requests.every(url => !/^https?:/u.test(url) || new URL(url).origin === origin),
    "no remote PDF resources"
  );
  writeFileSync(
    resolve(output, "pdf-local.json"),
    JSON.stringify(
      {
        ...result,
        boundaries,
        sizeBoundary,
        cache,
        requests,
        consoleErrors: page.consoleErrors,
        condition: "Actual product Worker and nested PDF.js Worker, synthetic text-only PDFs and empty PDF. Empty covers no text-layer behavior; image-only/scanned real documents and OCR are not validated. Timings are local individual samples, not percentiles."
      },
      null,
      2
    )
  );
  console.log("PASS actual PDF bytes through product Worker and local PDF.js Worker");
} finally {
  await browser.close();
  await server.close();
}
