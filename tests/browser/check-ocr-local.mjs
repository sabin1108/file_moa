import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = resolve(process.argv[2] ?? ".omx/verification/ocr-wiki/ocr");
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: resolve("apps/web"), logLevel: "error", cacheDir: resolve(".omx/browser-cache/ocr"),
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: { alias: { "@personal-ai/domain": resolve("packages/domain/src/index.ts") } },
  plugins: [{ name: "local-ocr-check", configureServer(server) {
    server.middlewares.use("/__ocr", (_request, response) => {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="ko"><body><script type="module">import {createCopyHasher} from "/src/features/local-folders/services/copy-hash.ts";import {saveOcrEnabled} from "/src/features/local-folders/store/ocr-preferences.ts";window.readLocal=async(bytes,name)=>{const reader=createCopyHasher();try{return await reader.readText(new File([new Uint8Array(bytes)],name),"회의 LOCAL OCR");}finally{reader.dispose();}};window.ocrEnable=saveOcrEnabled;</script></body></html>');
    });
  } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
let page;
const checks = [];
const requests = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
function characterAccuracy(actual, expected) {
  const left = actual.replace(/\s/gu, ""), right = expected.replace(/\s/gu, "");
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++) next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    previous = next;
  }
  return 1 - previous[right.length] / Math.max(1, right.length);
}
assert.equal(characterAccuracy("같은 글", "같은글"), 1);
assert.ok(Math.abs(characterAccuracy("abc", "abx") - 2 / 3) < 1e-12);
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  const track = session => {
    browser.on(session, "Network.requestWillBeSent", event => requests.push({ url: event.request.url, method: event.request.method }));
    browser.on(session, "Target.attachedToTarget", event => {
      track(event.sessionId);
      void (async () => {
        await browser.send("Network.enable", {}, event.sessionId);
        await browser.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, event.sessionId);
        await browser.send("Runtime.runIfWaitingForDebugger", {}, event.sessionId);
      })().catch(() => {});
    });
  };
  track(page.sessionId);
  await page.send("Network.enable");
  await page.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  await page.goto(base + "/__ocr", { settleMs: 800 });
  for (let n = 0; n < 200 && !await page.eval(() => !!window.readLocal); n++) await new Promise(r => setTimeout(r, 50));
  await page.eval(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 500;
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black"; context.font = '68px "Malgun Gothic", sans-serif';
    context.fillText("회의 자료 검증", 65, 130);
    context.fillText("LOCAL OCR 2026", 65, 260);
    context.fillText("원본 변경 없음", 65, 390);
    document.body.append(canvas);
    const png = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", .94));
    window.scanPng = [...new Uint8Array(await png.arrayBuffer())];
    window.scanJpeg = [...new Uint8Array(await jpeg.arrayBuffer())];
  });
  await page.screenshot({ path: resolve(output, "synthetic-scan.png"), format: "png" });
  const disabled = await page.eval(async () => { try { await readLocal(scanPng, "scan.png"); return "unexpected"; } catch (error) { return error.message; } });
  check("image OCR requires explicit device setting", disabled === "ocr-disabled");
  await page.eval(() => ocrEnable(true));
  const png = await page.eval(async () => {
    const original = new Uint8Array(scanPng);
    const before = [...new Uint8Array(await crypto.subtle.digest("SHA-256", original))];
    const result = await readLocal(scanPng, "scan.png");
    return { result, unchanged: JSON.stringify(before) === JSON.stringify([...new Uint8Array(await crypto.subtle.digest("SHA-256", original))]) };
  });
  writeFileSync(resolve(output, "png-result.json"), JSON.stringify(png, null, 2));
  const accuracy = characterAccuracy(png.result.fullText, "회의 자료 검증 LOCAL OCR 2026 원본 변경 없음");
  check("actual Korean and English PNG OCR meets the 90 percent synthetic-character gate", accuracy >= .9 && /자료/u.test(png.result.fullText) && /LOCAL\s+OCR\s+2026/iu.test(png.result.fullText));
  check("OCR labels derived text and preserves the source hash", png.result.ocr.pages === 1 && png.unchanged && /^[a-f0-9]{64}$/u.test(png.result.sha256));
  const jpeg = await page.eval(() => readLocal(scanJpeg, "scan.jpeg"));
  check("actual JPEG recognition uses the same local engine", /2026/u.test(jpeg.fullText) && jpeg.ocr.pages === 1);
  await page.eval(() => {
    window.scannedPdf = (pages, tailText = false) => {
      const encode = text => new TextEncoder().encode(text);
      const image = new Uint8Array(scanJpeg);
      const content = encode("q 700 0 0 250 0 0 cm /Im0 Do Q");
      const objects = [encode("<< /Type /Catalog /Pages 2 0 R >>"), encode(`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${i+5} 0 R`).join(" ")}] /Count ${pages} >>`),
        [encode(`<< /Type /XObject /Subtype /Image /Width 1400 /Height 500 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`), image, encode("\nendstream")],
        [encode(`<< /Length ${content.length} >>\nstream\n`), content, encode("\nendstream")],
        ...Array.from({length:pages},()=>encode("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 250] /Resources << /XObject << /Im0 3 0 R >> >> /Contents 4 0 R >>"))];
      if (tailText) {
        objects[1] = encode(`<< /Type /Pages /Kids [${Array.from({length:pages},(_,i)=>`${i+5} 0 R`).join(" ")} ${pages+7} 0 R] /Count ${pages+1} >>`);
        const text = "BT /F1 12 Tf 20 100 Td (LaterTextEvidence) Tj ET";
        objects.push(encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"), encode(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`), encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 700 250] /Resources << /Font << /F1 ${pages+5} 0 R >> >> /Contents ${pages+6} 0 R >>`));
      }
      const chunks=[encode("%PDF-1.4\n")], offsets=[0]; let length=chunks[0].length;
      const append=bytes=>{chunks.push(bytes);length+=bytes.length;};
      objects.forEach((object,index)=>{offsets.push(length);append(encode(`${index+1} 0 obj\n`));for(const chunk of Array.isArray(object)?object:[object])append(chunk);append(encode("\nendobj\n"));});
      const xref=length;append(encode(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,"0")+" 00000 n \n").join("")}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
      const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return [...result];
    };
  });
  const rasterProbe = await page.eval(() => new Promise(resolve => {
    const worker = new Worker('/tests/browser-fixtures/ocr-pdf.worker.ts', { type: 'module' });
    worker.onmessage = event => { worker.terminate(); resolve(event.data); };
    worker.onerror = event => { worker.terminate(); resolve({ error: event.message }); };
    worker.postMessage(scannedPdf(1));
  }));
  writeFileSync(resolve(output, "raster-probe.json"), JSON.stringify(rasterProbe, null, 2));
  assert.ok(!rasterProbe.error, JSON.stringify(rasterProbe));
  const pdf = await page.eval(() => readLocal(scannedPdf(1), "scan.pdf"));
  check("scanned PDF is rendered locally and recognized", /자료/u.test(pdf.fullText) && /2026/u.test(pdf.fullText) && pdf.pdf.pages === 1 && pdf.ocr.pages === 1);
  const partial = await page.eval(() => readLocal(scannedPdf(4), "four-pages.pdf"));
  check("OCR stops after three scanned pages and labels the partial result", partial.pdf.pages === 4 && partial.pdf.complete === false && partial.ocr.pages === 3);
  const mixed = await page.eval(() => readLocal(scannedPdf(4, true), "mixed.pdf"));
  check("OCR limit preserves later text-layer pages", mixed.pdf.pages === 5 && mixed.pdf.complete === false && mixed.ocr.pages === 3 && mixed.fullText.includes("LaterTextEvidence"));
  const invalid = await page.eval(async () => { try { await readLocal([1, 2, 3], "bad.png"); return "unexpected"; } catch (error) { return error.message; } });
  check("damaged image fails without treating bytes as text", invalid === "ocr-image-invalid");
  check("no document upload or external CDN request", requests.every(request => request.method === "GET" && (!/^https?:/u.test(request.url) || request.url.startsWith(base))));
  check("local language assets were loaded", requests.some(r => r.url.endsWith("/kor.traineddata")) && requests.some(r => r.url.endsWith("/eng.traineddata")));
  const cancellation = await page.eval(async () => {
    const { createCopyHasher } = await import("/src/features/local-folders/services/copy-hash.ts");
    const operation = new AbortController();
    const reader = createCopyHasher(operation.signal);
    const pending = reader.readText(new File([new Uint8Array(scannedPdf(4))], "cancel.pdf"), "검증");
    setTimeout(() => operation.abort(), 250);
    try { await pending; return "completed-before-cancel"; }
    catch (error) { return error.name; }
    finally { reader.dispose(); }
  });
  check("cancelling OCR terminates inspection and rejects rather than waiting for engine completion", cancellation === "AbortError");
  let workers = [];
  for (let n = 0; n < 40; n++) {
    workers = (await browser.send("Target.getTargets")).targetInfos.filter(target => target.type === "worker");
    if (!workers.length) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  check("normal completion and cancellation leave no nested OCR Worker alive", workers.length === 0);
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, condition: "Actual Tesseract7 Korean/English + PDF.js in isolated Chromium; synthetic canvas images/scanned PDFs; same-origin engine/core/language files; no personal file, OS permission, cloud upload or model call. OCR is approximate: the clean PNG may misread a Korean character; the gate measures normalized edit distance, not exact text identity or real-document accuracy.", syntheticPngAccuracy: accuracy, png: png.result, jpeg, pdf, partial, requests }, null, 2));
  console.log(`${checks.length} actual local OCR checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ checks, error: String(error), consoleErrors: page?.consoleErrors, requests }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
