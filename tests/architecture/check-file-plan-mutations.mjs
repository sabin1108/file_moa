// Bounded test-effectiveness check. Restore exact source bytes even when the runner fails.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const out = 'docs/verification/file-change-plan';
mkdirSync(out, { recursive: true });
const mutations = [
  {
    name: 'exact-name-conflict',
    file: 'apps/web/src/features/local-folders/lib/file-change-plan.ts',
    from: 'if (names?.exact.has(name)) issues.push("name-conflict");',
    to: 'if (false) issues.push("name-conflict");',
    test: 'apps/web/tests/local-folders/lib/file-change-plan.test.ts',
  },
  {
    name: 'abort-pending-read',
    file: 'apps/web/src/features/local-folders/store/source-plan-controller.ts',
    from: 'this.abort?.abort();',
    to: '// Deliberate verification mutation: omit abort.',
    test: 'apps/web/tests/local-folders/store/source-plan-controller.test.ts',
  },
];
const results = [];
for (const mutation of mutations) {
  const original = readFileSync(mutation.file);
  const source = original.toString('utf8');
  assert.equal(source.split(mutation.from).length, 2, 'Mutation target must be unique');
  try {
    writeFileSync(mutation.file, source.replace(mutation.from, mutation.to));
    const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', mutation.test], { encoding: 'utf8' });
    writeFileSync(`${out}/mutation-${mutation.name}.txt`, `${run.stdout}\n${run.stderr}`);
    assert.equal(run.error, undefined);
    assert.notEqual(run.status, 0, 'Deliberately broken behavior must fail');
    assert.match(`${run.stdout}\n${run.stderr}`, /AssertionError/);
    results.push({ name: mutation.name, status: run.status, detected: true });
  } finally {
    writeFileSync(mutation.file, original);
    assert.deepEqual(readFileSync(mutation.file), original);
  }
}
writeFileSync(`${out}/mutation-checks.json`, JSON.stringify({ at: new Date().toISOString(), results, restored: true }, null, 2));
console.log(JSON.stringify(results));
