import assert from "node:assert/strict";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
const output = resolve(process.argv[2] ?? ".omx/verification/optional-semantic-20261115/layout");
mkdirSync(output, { recursive: true });
// Ego completed the live model tests; its screenshot API timed out. An isolated browser checks the default UI only.
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3037/__semantic", { settleMs: 500 });
  await page.eval(() => document.querySelector("[data-rag-settings]").click());
  for (let i = 0; i < 100 && !await page.eval(() => !!document.querySelector("[data-semantic-model]")); i++) await new Promise(resolve => setTimeout(resolve, 25));
  await page.eval(() => { document.querySelector("[data-semantic-model]").open = true; });
  const checks = [];
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    assert.ok(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), `${width} horizontal overflow`);
    await page.screenshot({ path: resolve(output, `settings-${width}.png`), format: "png", fullPage: true });
    checks.push({ width, fits: true });
  }
  assert.ok(await page.eval(() => !document.querySelector("[data-semantic-prepare]") || document.querySelector("[data-semantic-prepare]").disabled));
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, errors: page.consoleErrors, condition: "Isolated default uninstalled UI; actual model execution and RAG are verified separately in Ego." }, null, 2));
  console.log({ widths: checks.length, errors: page.consoleErrors.length });
} finally { await browser.close(); }
