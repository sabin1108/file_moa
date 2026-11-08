import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
const output = "docs/verification/conversation-organization";
const recorded = JSON.parse(readFileSync(`${output}/performance-result.json`, "utf8"));
const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--disable-gpu-compositing", "--disable-software-rasterizer", "--disable-dev-shm-usage", "--no-sandbox"] });
const results = [];
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3034/demo", { settleMs: 200 });
  await page.eval(() => document.getElementById("message-draft").focus());
  await page.send("Input.insertText", { text: "검토" });
  await page.eval(state => {
    const key = Object.keys(sessionStorage).find(key => key.startsWith("moa.sample.v1."));
    if (!key) throw new Error("No sample session storage");
    const baseline = JSON.parse(sessionStorage.getItem(key));
    sessionStorage.setItem(key, JSON.stringify({ ...state, locations: { ...baseline.locations, ...state.locations },
      lastApplied: state.lastApplied ? { ...state.lastApplied, before: { ...baseline.locations, ...state.lastApplied.before }, after: { ...baseline.locations, ...state.lastApplied.after } } : null }));
  }, recorded.state);
  await page.goto("http://127.0.0.1:3034/demo", { settleMs: 200 });
  await page.eval(() => document.querySelector('[data-action="open-plan"]').click());
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 1000 });
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await page.eval(() => ({ viewportOverflow: document.documentElement.scrollWidth > innerWidth,
      regions: [...document.querySelectorAll('[aria-label="대화 내용"], #conversation-materials')].map(node => ({ label: node.getAttribute('aria-label'), width: node.clientWidth, scrollWidth: node.scrollWidth })) }));
    results.push({ width, ...result });
    await page.screenshot({ path: `${output}/plan-replay-${width}.png`, format: "png", fullPage: true });
    assert.equal(result.viewportOverflow, false);
    assert.ok(result.regions.every(region => region.scrollWidth <= region.width), `${width}: content region overflows`);
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/plan-replay-checks.json`, JSON.stringify({ condition: "UI-only replay of recorded synthetic plan; no model call", results }, null, 2));
}
console.log(JSON.stringify({ replayWidths: results.length, regionsWithoutOverflow: true }));
