import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:3035";
const output = process.argv[3] ?? "docs/verification/general-chat/production";
const trustedOrigin = process.argv[4] ?? new URL(base).origin;
const checks = [];

for (const scenario of ["guest", "cross-origin", "missing-origin", "GET", "PUT"]) {
  const method = ["GET", "PUT"].includes(scenario) ? scenario : "POST";
  const headers = { "content-type": "application/json" };

  if (scenario !== "missing-origin") headers.origin = scenario === "cross-origin" ? "https://outside.invalid" : trustedOrigin;

  const response = await fetch(base + "/api/chat", {
    method,
    headers,
    redirect: "error",
    ...(method === "GET" ? {} : { body: JSON.stringify({ question: "fixture-private-marker" }) }),
  });
  const expected = scenario === "guest" ? 401 : ["GET", "PUT"].includes(scenario) ? 405 : 403;

  assert.equal(response.status, expected, scenario);

  const text = await response.text();

  assert.ok(!text.includes("fixture-private-marker"), "rejected input is not echoed");
  assert.ok(!response.headers.has("access-control-allow-origin"), "no cross-origin grant");

  if (method === "POST") assert.ok(response.headers.get("cache-control")?.includes("no-store"));

  checks.push({ scenario, status: response.status, passed: true });
}

mkdirSync(output, { recursive: true });
writeFileSync(`${output}/route-checks.json`, JSON.stringify({
  buildId: readFileSync("apps/web/.next/BUILD_ID", "utf8").trim(),
  checks,
  condition: "Actual Next production HTTP route; no signed-in cookies, no live provider keys, no authenticated streaming claim",
}, null, 2));
console.log(`${checks.length} production chat rejection checks passed.`);
