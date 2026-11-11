import { saveRevision, loadLatest, digest } from './record-store.js';
import { previewRecovery, recoverRecord } from './record-recovery.js';

const metadata = (revisionId, parentRevisionId = null) => ({
  recordId: 'recover-record',
  revisionId,
  parentRevisionId,
  kind: 'artifact',
  scope: { type: 'global' },
  state: 'draft',
  createdAt: '2026-10-25T00:00:00.000Z'
});

async function put(dir, name, value) {
  const f = await dir.getFileHandle(name, { create: true });
  const w = await f.createWritable();

  await w.write(value);
  await w.close();
}

async function reject(fn, message) {
  try {
    await fn();
  } catch (error) {
    if (!String(error.message).includes(message) && error.name !== message) throw error;

    return;
  }

  throw new Error(`Missing failure: ${message}`);
}

const expect = (condition, reason) => {
  if (!condition) throw new Error(reason);
};

export async function runRecoveryChecks() {
  const suite = await (await navigator.storage.getDirectory()).getDirectoryHandle(
    `recovery-tests-${crypto.randomUUID()}`,
    { create: true }
  );
  const output = await suite.getDirectoryHandle('output', { create: true });
  const checks = [];
  const check = async (name, fn) => {
    await fn();
    checks.push({ name, passed: true });
  };
  const source = await suite.getDirectoryHandle('interrupted', { create: true });

  await saveRevision(source, metadata('r1'), '정상 기록');
  await put(source, 'r2.md', '미완료 기록');
  await put(source, 'r2.json', '');
  await put(source, 'orphan.md', '고아 본문');

  let preview;

  await check('preview identifies incomplete metadata and orphan body without source mutation', async () => {
    preview = await previewRecovery(source, 'recover-record');
    expect(preview.headRevisionId === 'r1' && preview.revisionCount === 1, 'wrong head');
    expect(
      preview.incompleteMetadata.includes('r2.json') && preview.orphanBodies.includes('orphan.md'),
      'missing incomplete files'
    );
  });
  await check('recovery copies only verified history and can continue in new directory', async () => {
    const result = await recoverRecord(source, output, 'recover-record', preview.fingerprint);

    expect(
      (await loadLatest(result.directory, 'recover-record')).body === '정상 기록',
      'wrong recovered body'
    );
    await saveRevision(result.directory, metadata('r3', 'r1'), '복구 후 수정');
    expect(
      (await loadLatest(result.directory, 'recover-record')).metadata.revisionId === 'r3',
      'cannot continue'
    );
    expect(
      (await previewRecovery(source, 'recover-record')).fingerprint === preview.fingerprint,
      'source mutated'
    );
  });
  await check('changed source invalidates approved preview before destination creation', async () => {
    const stale = preview.fingerprint;

    await put(source, 'orphan.md', '외부 변경');
    await reject(() => recoverRecord(source, output, 'recover-record', stale), 'stale-recovery-preview');
    preview = await previewRecovery(source, 'recover-record');
  });
  await check(
    'overlapping destination is rejected',
    () => reject(
      () => recoverRecord(source, suite, 'recover-record', preview.fingerprint),
      'overlapping-recovery-destination'
    )
  );
  await check('destination write failure never alters source or returns success', async () => {
    const before = (await previewRecovery(source, 'recover-record')).fingerprint;

    await reject(
      () => recoverRecord(source, output, 'recover-record', preview.fingerprint, async () => {
        throw new DOMException('Injected target failure', 'QuotaExceededError');
      }),
      'QuotaExceededError'
    );
    expect(
      (await previewRecovery(source, 'recover-record')).fingerprint === before,
      'source changed after failure'
    );
  });
  await check('nonempty malformed metadata is never silently skipped', async () => {
    const bad = await suite.getDirectoryHandle('bad-json', { create: true });

    await saveRevision(bad, metadata('r1'), 'base');
    await put(bad, 'r2.json', '{broken');
    await reject(() => previewRecovery(bad, 'recover-record'), 'incomplete-record-metadata');
  });
  await check('body corruption and missing parent refuse recovery', async () => {
    const bad = await suite.getDirectoryHandle('bad-body', { create: true });

    await saveRevision(bad, metadata('r1'), 'base');
    await put(bad, 'r1.md', 'edited');
    await reject(() => previewRecovery(bad, 'recover-record'), 'content-hash-mismatch');

    const missing = await suite.getDirectoryHandle('missing-parent', { create: true });

    await saveRevision(missing, metadata('r1'), 'base');

    const raw = JSON.parse(await (await (await missing.getFileHandle('r1.json')).getFile()).text());

    raw.parentRevisionId = 'missing';
    await put(missing, 'r1.json', JSON.stringify(raw));
    await reject(() => previewRecovery(missing, 'recover-record'), 'missing-parent-revision');
  });
  await check('branched valid revisions cannot be guessed into one history', async () => {
    const fork = await suite.getDirectoryHandle('fork', { create: true });

    await saveRevision(fork, metadata('r1'), 'base');
    await saveRevision(fork, metadata('r2', 'r1'), 'one');
    await put(fork, 'r3.md', 'two');
    await put(
      fork,
      'r3.json',
      JSON.stringify({
        ...metadata('r3', 'r1'),
        schemaVersion: 1,
        contentFile: 'r3.md',
        contentSha256: await digest('two')
      })
    );
    await reject(() => previewRecovery(fork, 'recover-record'), 'revision-conflict');
  });
  await check('source change during copy refuses successful activation', async () => {
    const before = await previewRecovery(source, 'recover-record');
    let changed = false;

    await reject(() => recoverRecord(source, output, 'recover-record', before.fingerprint, async (dir, name, text) => {
      await put(dir, name, text);

      if (!changed) {
        changed = true;
        await put(source, 'orphan.md', 'changed during copy');
      }
    }), 'source-changed-during-recovery');
  });
  await check('empty or all-incomplete history cannot be reported as recovered', async () => {
    const empty = await suite.getDirectoryHandle('empty', { create: true });

    await put(empty, 'r1.json', '');
    await put(empty, 'r1.md', 'not committed');
    await reject(() => previewRecovery(empty, 'recover-record'), 'no-recoverable-revision');
  });

  return checks;
}
