import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = process.argv[3] ?? "docs/verification/live-ai-transfer";
const manifest = JSON.parse(readFileSync("apps/web/.next/server/server-reference-manifest.json", "utf8"));
const action = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === "liveOrganizationAction")?.[0];

assert.ok(action, "production action is registered");

const checks = [];

for (const origin of [new URL(base).origin, "https://evil.invalid"]) {
  const response = await fetch(base + "/", {
    method: "POST",
    redirect: "manual",
    headers: { "next-action": action, "content-type": "text/plain;charset=UTF-8", origin },
    body: JSON.stringify(["openai", { requestId: "fixture-unauthenticated-marker", consent: true }])
  });
  const text = await response.text();

  if (origin === new URL(base).origin) {
    assert.ok(
      text.includes('"code":"session"'),
      "actual production action rejects an unauthenticated session"
    );
    assert.ok(!text.includes("fixture-unauthenticated-marker"), "rejected input is not echoed");
  } else {
    assert.equal(response.status, 500, "Next rejects a cross-origin Action before business logic");
    assert.ok(!text.includes('"ok":true'), "cross-origin request cannot succeed");
  }

  checks.push({
    origin: origin === new URL(base).origin ? "same-origin-unauthenticated" : "cross-origin",
    status: response.status,
    passed: true
  });
}

mkdirSync(output, { recursive: true });
writeFileSync(`${output}/production-action.json`, JSON.stringify({
  at: new Date().toISOString(),
  buildId: readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(),
  condition: "actual Next production Action HTTP; no signed-in user or provider call",
  checks
}, null, 2));
console.log("2 production Action rejection checks passed.");
