import assert from "node:assert/strict";

const variants = new Set(["before", "after"]);
export function browserMetric(value) {
  assert.ok(value && typeof value === "object");
  assert.ok(variants.has(value.variant));
  assert.match(value.run, /^[a-f0-9-]{36}$/);
  const common = { kind: value.kind, variant: value.variant, run: value.run };
  const allowed = {
    start: ["kind", "variant", "run", "rounds"],
    browser: ["kind", "variant", "run", "step", "phase", "elapsedMs", "viewport"],
    done: ["kind", "variant", "run"],
    aborted: ["kind", "variant", "run", "reason"],
  }[value.kind];
  assert.ok(allowed && Object.keys(value).every(key => allowed.includes(key)));
  if (value.kind === "start") { assert.equal(value.rounds, 10); return { ...common, rounds: 10 }; }
  if (value.kind === "browser") {
    assert.ok(Number.isInteger(value.step) && value.step >= 0 && value.step < 20);
    assert.equal(value.phase, value.step % 2 ? "settings" : "home");
    assert.ok(Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0 && value.elapsedMs < 120000);
    assert.ok(Number.isInteger(value.viewport) && value.viewport >= 320 && value.viewport <= 8000);
    return { ...common, step: value.step, phase: value.phase, elapsedMs: value.elapsedMs, viewport: value.viewport };
  }
  if (value.kind === "aborted") {
    assert.ok(["background-tab", "screen-not-ready", "route-mismatch"].includes(value.reason));
    return { ...common, reason: value.reason };
  }
  return common;
}

export function stats(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    medianMs: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    minMs: sorted[0], maxMs: sorted.at(-1),
  };
}

export function summarize(records) {
  const completed = records.filter(record => record.kind === "done").map(record => record.run);
  const result = {};
  for (const variant of variants) {
    const rows = records.filter(row => row.kind === "browser" && row.variant === variant && completed.includes(row.run));
    result[variant] = {
      completedRuns: completed.filter(run => records.some(row => row.kind === "start" && row.run === run && row.variant === variant)).length,
      initialWorkspace: stats(rows.filter(row => row.step === 0).map(row => row.elapsedMs)),
      firstSettings: stats(rows.filter(row => row.step === 1).map(row => row.elapsedMs)),
      initialJourney: stats(completed.flatMap(run => {
        const home = rows.find(row => row.run === run && row.step === 0);
        const settings = rows.find(row => row.run === run && row.step === 1);
        return home && settings ? [home.elapsedMs + settings.elapsedMs] : [];
      })),
      repeatedSettings: stats(rows.filter(row => row.phase === "settings" && row.step > 1).map(row => row.elapsedMs)),
      settingsReader: stats(records.filter(row => row.kind === "server" && row.variant === variant && row.label.startsWith("settings-") && completed.includes(row.run)).map(row => row.elapsedMs)),
    };
  }
  const before = result.before.repeatedSettings?.medianMs;
  const after = result.after.repeatedSettings?.medianMs;
  result.repeatedMedianReductionPercent = before > 0 && after !== undefined ? (before - after) / before * 100 : null;
  return result;
}

// Self-checks cover cost-free metric validation and calculation without importing application data.
if (process.argv.includes("--self-test")) {
  const run = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  assert.throws(() => browserMetric({ kind: "browser", variant: "after", run, step: 1, phase: "settings", elapsedMs: -1, viewport: 1440 }));
  assert.throws(() => browserMetric({ kind: "done", variant: "before", run, email: "must-not-be-recorded" }));
  assert.deepEqual(stats([30, 10, 20, 40]), { n: 4, medianMs: 25, p95Ms: 40, minMs: 10, maxMs: 40 });
  assert.equal(summarize([{ kind: "browser", variant: "before", run, step: 3, phase: "settings", elapsedMs: 900 }]).before.repeatedSettings, null);
  console.log("4 metric validation/statistics self-checks passed.");
}
