import { mkdirSync, writeFileSync, readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3034";
const phase = process.argv[3] ?? "after";
const output = process.argv[4] ?? "docs/verification/sample-workspace";
mkdirSync(output, { recursive: true });
const routes = phase === "cold" ? ["/demo"] : ["/login", "/welcome", "/forgot-password", "/reset-password", "/verify-email", "/files"];
if (phase === "after") routes.push("/demo", "/demo/files", "/demo/settings");
const samples = [];
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
try {
  for (const route of routes) for (const width of [390, 1440]) for (let round = 0; round < 3; round++) {
    const page = await browser.newPage({ width, height: 1000 });
    if (phase === "cold") {
      await page.send("Network.enable");
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    }
    await page.goto(base + route, { settleMs: 160 });
    const measured = await page.eval(async () => {
      let lcp = 0, cls = 0;
      const paint = new PerformanceObserver(list => { for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime); });
      const shifts = new PerformanceObserver(list => { for (const entry of list.getEntries()) if (!entry.hadRecentInput) cls += entry.value; });
      paint.observe({ type: "largest-contentful-paint", buffered: true });
      shifts.observe({ type: "layout-shift", buffered: true });
      await new Promise(resolve => setTimeout(resolve, 80));
      paint.disconnect(); shifts.disconnect();
      const resources = performance.getEntriesByType("resource");
      const navigation = performance.getEntriesByType("navigation")[0];
      return { finalPath: location.pathname, lcp, cls, requests: resources.length,
        documentTransferBytes: navigation?.transferSize ?? 0,
        transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0),
        jsTransferBytes: resources.filter(entry => /\.js(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + entry.transferSize, 0) };
    });
    samples.push({ route, width, round, ...measured });
    if (phase === "cold" && measured.jsTransferBytes === 0) throw new Error("Cold-cache measurement did not transfer JavaScript");
    await page.close();
  }
} finally {
  await browser.close();
}
function assetBytes(directory) {
  return readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    const file = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? assetBytes(file) : /\.(js|css)$/.test(entry.name) ? statSync(file).size : 0);
  }, 0);
}
writeFileSync(`${output}/performance-${phase}.json`, JSON.stringify({
  at: new Date().toISOString(), base, condition: phase === "cold"
    ? "local production /demo, valid sample cookie, HTTP cache disabled, no throttling, new target per sample"
    : "local production, unauthenticated guest routes (files redirects to login), no throttling, new target per sample, shared browser HTTP cache",
  buildId: readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(),
  staticJsCssBytes: assetBytes("apps/web/.next/static"), samples,
}, null, 2));
console.log(`Measured ${samples.length} local guest route samples (${phase}).`);
