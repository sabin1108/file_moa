import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = process.argv[3] ?? "docs/verification/live-local-preparation";
const directory = "apps/web/.next/static/chunks";
let bootstrap;
for (const name of readdirSync(directory).filter(name => name.endsWith(".js"))) {
  const source = readFileSync(`${directory}/${name}`, "utf8");
  for (const match of source.matchAll(/\.f\("([^"]*turbopack-worker[^"]*)",(\[[^\]]+\])\)/g)) {
    const chunks = JSON.parse(match[2]);
    if (chunks.some(chunk => {
      const code = readFileSync(`apps/web/.next/${chunk}`, "utf8");
      return code.includes("self.onmessage") && code.includes("excerptHash");
    })) bootstrap = { entry: match[1], chunks };
  }
}
assert.ok(bootstrap, "Compiled snapshot Worker bootstrap must exist");
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
let result;
try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  await page.goto(base + "/login", { settleMs: 200 });
  // Replay the generated public Turbopack Worker bootstrap, without bypassing route authentication.
  result = await page.eval(async bootstrap => {
    const params = [bootstrap.chunks.map(path => "/_next/" + path).reverse(), "", "/_next/", null, null];
    const url = new URL("/_next/" + bootstrap.entry, location.origin);
    url.hash = "params=" + encodeURIComponent(JSON.stringify(params));
    const worker = new Worker(url);
    const request = data => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Worker did not respond")), 5000);
      worker.onmessage = event => { clearTimeout(timer); resolve(event.data); };
      worker.onerror = event => { clearTimeout(timer); reject(Error(event.message)); };
      worker.postMessage(data);
    });
    try {
      const hash = await request(new File(["abc"], "copy.bin"));
      const snapshot = await request({ file: new File(["앞부분 ".repeat(500) + "LCP 성능 실측"], "note.md"), instruction: "성능" });
      const invalid = await request({ file: new File([new Uint8Array([0xc3, 0x28])], "bad.md"), instruction: "자료" });
      const found = await request({ file: new File(["회의 자료\n" + "앞부분 ".repeat(1000) + "\n회의일: 2026-10-15"], "meeting.md"), instruction: "회의", find: { terms: ["회의"], from: "2026-10-01", to: "2026-10-31", basis: "meeting" } });
      return { hash, snapshot, invalid, found };
    } finally { worker.terminate(); }
  }, bootstrap);
  assert.equal(result.hash.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.ok(result.snapshot.excerpt.includes("LCP 성능 실측"));
  assert.match(result.snapshot.excerptHash, /^[a-f0-9]{64}$/);
  assert.equal(result.invalid.issue, "invalid-utf8");
  assert.equal(result.found.finding.kind, "matched");
  assert.deepEqual(result.found.finding.dates, ["2026-10-15"]);
  assert.ok(result.found.finding.evidence[0].includes("회의일: 2026-10-15"));
  assert.ok(!("text" in result.found));
  assert.deepEqual(page.consoleErrors, []);
} finally { await browser.close(); }
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/production-worker.json`, JSON.stringify({
  condition: "Final Next production static Worker bootstrap; synthetic File input; not a full authenticated route or physical disk check",
  buildId: readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(), bootstrap, result,
}, null, 2));
console.log("Production Worker: binary hash, text excerpt/hash, invalid UTF8 and full-body finding passed");
