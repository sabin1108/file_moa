import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = process.argv[3] ?? "docs/verification/completion-five/performance";
mkdirSync(output, { recursive: true });
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
const routes = [];
let checks = 0;
const check = value => { assert.ok(value); checks++; };
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  for (const route of ["/", "/files", "/settings", "/demo", "/demo/files", "/demo/settings?tab=controls"]) {
    const samples = [];
    for (let run = 0; run < 3; run++) {
      await page.goto(base + route, { settleMs: 200 });
      samples.push(await page.eval(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return { path: location.pathname, ttfbMs: Math.round(n.responseStart - n.requestStart), domContentLoadedMs: Math.round(n.domContentLoadedEventEnd - n.startTime), responseBytes: n.transferSize };
      }));
    }
    check(samples.every(sample => sample.path === (route.startsWith("/demo") ? route.split("?")[0] : "/login")));
    routes.push({ route, samples });
  }
  await page.eval(() => history.replaceState({ moaFileVisit: "synthetic-visit" }, "", "?tab=folders"));
  for (let n = 0; n < 100 && !await page.eval(() => document.querySelector('[aria-label="자료 폴더와 복구 보관함"]')?.checkVisibility()); n++) await new Promise(done => setTimeout(done, 30));
  check(await page.eval(() => document.querySelector('[aria-label="자료 폴더와 복구 보관함"]')?.checkVisibility()));
  check(await page.eval(() => history.state?.moaFileVisit === "synthetic-visit" && history.state?.__NA === true));
  check(page.consoleErrors.length === 0);
} finally { await browser.close(); }
const walk = directory => readdirSync(directory).flatMap(name => { const path = join(directory, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const assets = walk("apps/web/.next/static").filter(path => /\.(js|css)$/u.test(path));
const before = JSON.parse(readFileSync("docs/verification/request-routing/assets.json", "utf8")).after;
const after = { buildId: readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(), bytes: assets.reduce((sum, path) => sum + statSync(path).size, 0), files: assets.length };
writeFileSync(`${output}/routes-assets.json`, JSON.stringify({ condition: "Local production Chromium lab, one cold then two warm navigations per route, 1440px. Protected routes are guest redirects, not authenticated performance. No before route timing, field INP or infrastructure cost claim.", checks, routes, before, after, deltaBytes: after.bytes - before.bytes }, null, 2) + "\n");
console.log(JSON.stringify({ checks, before, after, deltaBytes: after.bytes - before.bytes }));
