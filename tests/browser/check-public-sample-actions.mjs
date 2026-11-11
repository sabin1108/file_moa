import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";

const base = "http://127.0.0.1:3035";
const output = "docs/verification/publish-safety/2026-11-08";
const manifest = JSON.parse(readFileSync("apps/web/.next/server/server-reference-manifest.json", "utf8"));
const start = await fetch(`${base}/demo/start?intro=done`, { redirect: "manual" });
// This is a newly generated synthetic sample credential, never a browser user's authentication cookie.
const cookie = start.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");

assert.ok(cookie);

const checks = [];

for (const name of ["sampleClassificationAction", "sampleOrganizationAction"]) {
  const action = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name)?.[0];

  assert.ok(action);

  const input = {
    requestId: crypto.randomUUID(),
    documentIds: ["report-1014"],
    consent: true,
    ...(name === "sampleOrganizationAction" ? { instruction: "보고서를 정리해줘" } : {})
  };
  const response = await fetch(`${base}/demo`, {
    method: "POST",
    headers: { "next-action": action, "content-type": "text/plain;charset=UTF-8", origin: base, cookie },
    body: JSON.stringify(["openai", input]),
  });
  const body = await response.text();

  assert.ok(body.includes('"code":"unavailable"'), `${name}: direct public call is disabled`);
  checks.push({ action: name, status: response.status, code: "unavailable", passed: true });
}

const attemptsFile = ".omx/publication-audit/blocked-model-attempts.json";
const blockedAttempts = existsSync(attemptsFile) ? JSON.parse(readFileSync(attemptsFile, "utf8")).attempts : 0;

assert.equal(blockedAttempts, 0, "guard stops before the independent provider-network blocker");
mkdirSync(output, { recursive: true });
writeFileSync(
  `${output}/sample-action-checks.json`,
  JSON.stringify(
    {
      condition: "Real local production Server Actions, newly created synthetic sample cookie, Vercel mode, fake model key and independent model-network blocker; not a signed-in user or paid call",
      checks,
      blockedAttempts
    },
    null,
    2
  )
);
console.log("2 public sample Action rejection checks passed; 0 model attempts.");
