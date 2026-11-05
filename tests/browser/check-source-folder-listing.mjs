import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { startProbe } from '../s0/probe-server.mjs';

// A dedicated disposable browser profile; never scans a personal source folder.
process.env.TASTE_SKILL_TMP = resolve('.taste-skill/listing-browser-profiles');
await mkdir(process.env.TASTE_SKILL_TMP, { recursive: true });
const { server, url } = await startProbe();
let browser;
try {
  browser = await Browser.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const result = await page.eval(async () => {
    const { FolderConnectionSession } = await import('/folder-session.js');
    const root = await navigator.storage.getDirectory();
    const suite = await root.getDirectoryHandle(`listing-${crypto.randomUUID()}`, { create: true });
    const a = await suite.getDirectoryHandle('자료 A', { create: true });
    const b = await suite.getDirectoryHandle('자료 B', { create: true });
    const child = await a.getDirectoryHandle('하위 자료', { create: true });
    const put = async (directory, name, body) => {
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(body);
      await writable.close();
    };
    await put(a, '노트.md', '# 직접 만든 검증 자료');
    await put(a, '이미지.bin', 'not a supported preview document');
    await put(child, '공백 포함.txt', '하위 자료의 원문');

    // Test-only reads hash all three tiny fixtures before/after the production reader.
    const snapshot = async (directory, prefix = '') => {
      const rows = [];
      for await (const handle of directory.values()) {
        const path = `${prefix}/${handle.name}`;
        if (handle.kind === 'directory') {
          rows.push({ path, kind: handle.kind });
          rows.push(...await snapshot(handle, path));
        } else {
          const file = await handle.getFile();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))];
          rows.push({ path, kind: handle.kind, size: file.size, mtime: file.lastModified, hash });
        }
      }
      return rows.sort((left, right) => left.path < right.path ? -1 : 1);
    };
    const before = await snapshot(suite);
    const checks = [];
    const check = (name, passed) => {
      if (!passed) throw new Error(name);
      checks.push({ name, passed });
    };
    const rejects = async (task, name) => {
      try { await task; } catch (error) { return error.name === name || error.message === name; }
      return false;
    };
    // Connection persistence is outside this slice; real OPFS handles and permissions are used.
    const session = new FolderConnectionSession({
      read: async () => undefined,
      write: async () => undefined,
      remove: async () => undefined,
    });
    await session.switchOwner({ userId: 'listing-probe', workspaceId: 'fixture-only' });
    await session.select('source', async () => a);
    const listing = await session.listSourceFolder([]);
    check('real direct children: folder first, unsupported extension retained',
      JSON.stringify(listing.entries) === JSON.stringify([
        { name: '하위 자료', kind: 'directory' },
        { name: '노트.md', kind: 'file' },
        { name: '이미지.bin', kind: 'file' },
      ]) && listing.truncated === false);
    const nested = await session.listSourceFolder(['하위 자료']);
    check('real child navigation and Korean filename', nested.entries.length === 1 && nested.entries[0].name === '공백 포함.txt');
    check('missing child reports NotFoundError', await rejects(session.listSourceFolder(['없는 폴더']), 'NotFoundError'));
    check('path traversal rejected', await rejects(session.listSourceFolder(['..']), 'invalid-folder-path'));
    const signal = AbortSignal.abort();
    check('pre-cancellation rejected', await rejects(session.listSourceFolder([], signal), 'AbortError'));
    await session.select('source', async () => b);
    const second = await session.listSourceFolder([]);
    check('second real folder is empty without borrowing A entries', second.entries.length === 0 && !second.truncated);
    await session.disconnect('source');
    check('disconnect blocks further enumeration', await rejects(session.listSourceFolder([]), 'source-folder-not-connected'));
    const after = await snapshot(suite);
    check('all source paths, hashes, sizes and mtimes unchanged', JSON.stringify(after) === JSON.stringify(before));
    return { checks, sourceFiles: 3, before, after, userAgent: navigator.userAgent };
  });
  assert.equal(result.checks.length, 8);
  const out = 'docs/verification/source-folder-listing';
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/browser-checks.json`, JSON.stringify({ ...result, verifiedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log(JSON.stringify({ checks: result.checks, browser: result.userAgent }, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}
