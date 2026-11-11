import { keepHandle, restoreHandle } from './handle-store.mjs';

export { keepHandle, restoreHandle } from './handle-store.mjs';

import { saveRevision, loadLatest } from './record-store.js';

const input = (revisionId = 'r1', parentRevisionId = null) => ({
  recordId: 's0-record',
  revisionId,
  parentRevisionId,
  kind: 'artifact',
  scope: { type: 'project', id: 's0-project' },
  state: 'draft',
  createdAt: '2026-10-25T00:00:00.000Z',
});

async function put(directory, name, text) {
  const file = await directory.getFileHandle(name, { create: true });
  const stream = await file.createWritable();

  await stream.write(text);
  await stream.close();
}

async function rejects(operation, expected) {
  try {
    await operation();
  } catch (error) {
    if (!String(error.message).includes(expected) && error.name !== expected) throw error;

    return;
  }

  throw new Error(`Expected rejection: ${expected}`);
}

export async function runChecks() {
  const checks = [];
  const root = await navigator.storage.getDirectory();
  const suite = await root.getDirectoryHandle(`moa-s0-${crypto.randomUUID()}`, { create: true });
  const check = async (name, fn) => {
    await fn();
    checks.push({ name, passed: true });
  };
  const expect = (value, reason) => {
    if (!value) throw new Error(reason);
  };
  const store = await suite.getDirectoryHandle('versions', { create: true });

  await check('real OPFS UTF-8 save and reopen', async () => {
    const result = await saveRevision(store, input(), '# 합성 보고서\n실제 개인정보가 없는 테스트입니다.');

    expect(result.body.includes('합성 보고서'), 'body differs');
    expect((await loadLatest(store, 's0-record')).metadata.revisionId === 'r1', 'reopen failed');
  });
  await check('new revision preserves previous content', async () => {
    await saveRevision(store, input('r2', 'r1'), '# 수정한 합성 보고서');
    expect((await (await store.getFileHandle('r1.md')).getFile()).size > 0, 'previous content lost');
    expect((await loadLatest(store, 's0-record')).metadata.revisionId === 'r2', 'wrong latest');
  });
  await check(
    'stale writer cannot replace newer revision',
    () => rejects(() => saveRevision(store, input('stale', 'r1'), 'stale'), 'stale-revision')
  );
  await check('orphan markdown does not publish a revision', async () => {
    await put(store, 'unpublished.md', 'interrupted write');
    expect((await loadLatest(store, 's0-record')).metadata.revisionId === 'r2', 'orphan published');
  });
  await check('competing saves serialize and reject stale parent', async () => {
    const results = await Promise.allSettled([
      saveRevision(store, input('race-a', 'r2'), 'A'), saveRevision(store, input('race-b', 'r2'), 'B'),
    ]);

    expect(results.filter(result => result.status === 'fulfilled').length === 1, 'both saves committed');
    expect(
      results.some(result => result.status === 'rejected' && result.reason.message === 'stale-revision'),
      'wrong rejection'
    );
  });
  await check('body corruption is rejected', async () => {
    await put(store, 'r1.md', 'external edit');
    await rejects(() => loadLatest(store, 's0-record'), 'content-hash-mismatch');
  });
  await check('exclusive writable rejects second writer', async () => {
    const file = await suite.getFileHandle('exclusive.txt', { create: true });
    const writer = await file.createWritable({ mode: 'exclusive' });

    try {
      await rejects(() => file.createWritable({ mode: 'exclusive' }), 'NoModificationAllowedError');
    }
    finally {
      await writer.abort();
    }
  });

  const failures = await suite.getDirectoryHandle('failures', { create: true });

  await saveRevision(failures, input(), 'previous good body');

  for (const [label, errorName, suffix] of [['permission', 'NotAllowedError', '.md'], ['quota', 'QuotaExceededError', '.md'], ['metadata', 'AbortError', '.json']]) {
    await check(`injected ${label} failure preserves published revision`, async () => {
      const faulty = {
        values: () => failures.values(),
        getFileHandle: async (name, options) => {
          if (options?.create && name.endsWith(suffix)) throw new DOMException('Injected failure', errorName);

          return failures.getFileHandle(name, options);
        },
      };

      await rejects(() => saveRevision(faulty, input(`failed-${label}`, 'r1'), 'not committed'), errorName);
      expect(
        (await loadLatest(failures, 's0-record')).body === 'previous good body',
        'published data changed'
      );
    });
  }

  await check('IndexedDB structured-clone handle restoration', async () => {
    await keepHandle(failures);

    const restored = await restoreHandle();

    expect(await restored.isSameEntry(failures), 'restored handle differs');
    expect(
      (await loadLatest(restored, 's0-record')).body === 'previous good body',
      'restored read failed'
    );
  });
  await check('failed metadata close is surfaced; previous version remains recoverable', async () => {
    const interrupted = await suite.getDirectoryHandle('interrupted-close', { create: true });

    await saveRevision(interrupted, input(), 'recoverable original');

    const faulty = {
      values: () => interrupted.values(),
      getFileHandle: async (name, options) => {
        const handle = await interrupted.getFileHandle(name, options);

        if (name !== 'r2.json' || !options?.create) return handle;

        return {
          createWritable: async options => {
            const stream = await handle.createWritable(options);

            return {
              write: value => stream.write(value),
              abort: () => stream.abort(),
              close: () => Promise.reject(new DOMException('Injected close failure', 'AbortError'))
            };
          }
        };
      },
    };

    await rejects(() => saveRevision(faulty, input('r2', 'r1'), 'not published'), 'AbortError');
    expect(
      await (await (await interrupted.getFileHandle('r1.md')).getFile()).text() === 'recoverable original',
      'previous body lost'
    );
    // A zero-byte metadata file is an incomplete commit: refuse silent rollback/overwrite.
    await rejects(() => loadLatest(interrupted, 's0-record'), 'incomplete-record-metadata');
  });

  return {
    browser: navigator.userAgent,
    storage: 'OPFS in disposable browser profile; not a user-picked folder',
    checks
  };
}
