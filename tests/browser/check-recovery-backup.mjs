import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { startBackupProbe } from '../fixtures/backup-probe-server.mjs';

const out = 'docs/verification/recovery-backup/browser';
mkdirSync(out, { recursive: true });
const probe = await startBackupProbe();
const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
let page;
try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.goto(probe.url);
  const result = await page.eval(async entry => {
    const { FolderConnectionSession } = await import(entry);
    const checks = [];
    const samples = [];
    const check = (name, passed) => {
      checks.push({ name, passed });
      if (!passed) throw Error(name);
    };
    const suite = await (await navigator.storage.getDirectory()).getDirectoryHandle(`backup-${crypto.randomUUID()}`, { create: true });
    const root = await suite.getDirectoryHandle('source', { create: true });
    const from = await root.getDirectoryHandle('from', { create: true });
    const to = await root.getDirectoryHandle('to', { create: true });
    const vaultParent = await suite.getDirectoryHandle('vault-parent', { create: true });
    const put = async (directory, name, body) => {
      const handle = await directory.getFileHandle(name, { create: true });
      const stream = await handle.createWritable();
      await stream.write(body);
      await stream.close();
    };
    const names = ['한글 공백.txt', 'empty.bin', 'large.bin'];
    for (const name of names) {
      await put(from, name, name === 'large.bin' ? new Uint8Array(1024 * 1024).fill(3) : `new ${name}`);
      await put(to, name, name === 'large.bin' ? new Uint8Array(1024 * 1024).fill(7) : name === 'empty.bin' ? '' : `old ${name}`);
    }
    const owner = { userId: 'backup-browser', workspaceId: 'isolated' };
    const saved = new Map();
    const session = new FolderConnectionSession({ read: async (_owner, kind) => saved.get(kind),
      write: async (_owner, kind, handle) => { saved.set(kind, handle); }, remove: async (_owner, kind) => { saved.delete(kind); } });
    await session.switchOwner(owner);
    await session.select('source', async () => root);
    await session.selectRecovery(async () => vaultParent, true);
    const vault = saved.get('recovery');
    const plan = { operation: 'copy', conflictCount: names.length, directoriesToCreate: [],
      rows: names.map(name => ({ from: ['from', name], to: ['to', name], issues: ['name-conflict'] })) };
    const digest = async file => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
    const snapshot = async directory => Promise.all(names.map(async name => {
      const file = await (await directory.getFileHandle(name)).getFile();
      return { name, size: file.size, mtime: file.lastModified, sha256: await digest(file) };
    }));
    const before = { from: await snapshot(from), to: await snapshot(to) };
    let writes = [];
    const writable = FileSystemFileHandle.prototype.createWritable;
    FileSystemFileHandle.prototype.createWritable = function (...args) {
      writes.push(this.name);
      return writable.apply(this, args);
    };
    // Count real hashing workers; hash implementation is never replaced by a main-thread shortcut.
    const NativeWorker = window.Worker;
    let workers = 0;
    let terminated = 0;
    window.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); workers++; }
      terminate() { terminated++; super.terminate(); }
    };
    const signal = new AbortController().signal;
    let started = performance.now();
    let approved = await session.inspectSourceBackup(plan, signal);
    samples.push({ operation: 'inspection', elapsedMs: performance.now() - started });
    check('inspection writes zero', writes.length === 0);
    check('inspection source plus target byte total', approved.totalBytes === before.from.concat(before.to).reduce((sum, file) => sum + file.size, 0));
    window.runBackup = async () => {
      started = performance.now();
      window.backupResult = await session.executeSourceBackup(plan, approved, signal, () => {});
      samples.push({ operation: 'backup-and-dual-audit', elapsedMs: performance.now() - started });
    };
    // Preserve the real session user-gesture gate by invoking the task with an actual browser click below.
    const button = document.createElement('button');
    button.textContent = 'Run isolated backup';
    button.onclick = () => { window.runBackup().catch(error => { window.backupError = error.message; }); };
    document.body.append(button);
    window.backupProbe = { session, plan, from, to, vault, names, saved, before, snapshot, digest, writes,
      checks, samples, check, workerCounts: () => ({ workers, terminated }) };
    window.prepareBackupRepeat = async bytes => {
      if (bytes) {
        await put(from, 'large.bin', new Uint8Array(bytes).fill(3));
        await put(to, 'large.bin', new Uint8Array(bytes).fill(7));
      }
      window.backupResult = undefined;
      window.backupError = undefined;
      started = performance.now();
      approved = await session.inspectSourceBackup(plan, signal);
      samples.push({ operation: 'repeat-inspection', payloadBytes: bytes || 1024 * 1024, elapsedMs: performance.now() - started });
    };
    return { ready: true };
  }, probe.entry);
  assert.equal(result.ready, true);
  const point = await page.eval(() => {
    const rect = document.querySelector('button').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
  for (let i = 0; i < 600; i++) {
    if (await page.eval(() => !!window.backupResult || !!window.backupError)) break;
    await new Promise(done => setTimeout(done, 30));
  }
  const evidence = await page.eval(async () => {
    const p = window.backupProbe;
    const result = window.backupResult;
    p.check('real session backup completed', !window.backupError && result?.phase === 'completed' && result.journalComplete);
    p.check('all items verified', result.items.every(item => item.status === 'verified'));
    p.check('source bytes/size/mtime unchanged', JSON.stringify(await p.snapshot(p.from)) === JSON.stringify(p.before.from));
    p.check('target bytes/size/mtime unchanged', JSON.stringify(await p.snapshot(p.to)) === JSON.stringify(p.before.to));
    p.check('no writable opened on original names', p.writes.every(name => !p.names.includes(name)));
    const operation = await p.vault.getDirectoryHandle(`moa-backup-${result.id}`);
    const history = await (await p.to.getDirectoryHandle('.moa-history')).getDirectoryHandle(`moa-backup-${result.id}`);
    const prepared = JSON.parse(await (await (await operation.getFileHandle('prepared.json')).getFile()).text());
    p.check('retention is explicitly undecided', prepared.retention.policy === 'undecided' && prepared.retention.expiresAt === null);
    for (const [index, item] of result.items.entries()) {
      const file = await (await operation.getFileHandle(`${item.recoveryId}.bin`)).getFile();
      p.check(`old destination preserved ${index}`, file.size === p.before.to[index].size && await p.digest(file) === p.before.to[index].sha256);
      const recordName = `${item.itemId}-verified.json`;
      const left = await (await (await operation.getFileHandle(recordName)).getFile()).text();
      const right = await (await (await history.getFileHandle(recordName)).getFile()).text();
      p.check(`paired verified record ${index}`, left === right && JSON.parse(left).sha256 === p.before.to[index].sha256);
    }
    p.check('real Worker hashes disposed', p.workerCounts().workers >= 2 && p.workerCounts().workers === p.workerCounts().terminated);
    const stopped = JSON.parse(await (await (await operation.getFileHandle('stopped.json')).getFile()).text());
    p.check('completion journal survives reread', stopped.reason === 'completed' && stopped.items.every(item => item.status === 'verified'));
    return { checks: p.checks, samples: p.samples, totalBytes: prepared.items.reduce((sum, item) => sum + item.source.size + item.target.size, 0), workers: p.workerCounts(), result };
  });
  evidence.browserErrors = page.consoleErrors;
  assert.equal(evidence.browserErrors.length, 0);
  // Three small/bounded operation samples plus a 16 MiB per-file boundary exercise.
  for (const bytes of [0, 0, 16 * 1024 * 1024]) {
    await page.eval(bytes => window.prepareBackupRepeat(bytes), bytes);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
    for (let i = 0; i < 1000; i++) {
      if (await page.eval(() => !!window.backupResult || !!window.backupError)) break;
      await new Promise(done => setTimeout(done, 30));
    }
    const repeat = await page.eval(() => ({ error: window.backupError, result: window.backupResult }));
    assert.equal(repeat.error, undefined);
    assert.equal(repeat.result.phase, 'completed');
    assert.equal(repeat.result.journalComplete, true);
  }
  evidence.samples = await page.eval(() => window.backupProbe.samples);
  evidence.finalWorkerCounts = await page.eval(() => window.backupProbe.workerCounts());
  assert.equal(evidence.finalWorkerCounts.workers, evidence.finalWorkerCounts.terminated);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ at: new Date().toISOString(), moduleCount: probe.moduleCount, ...evidence }, null, 2));
  console.log(`${evidence.checks.length} recovery backup browser checks passed`);
} finally {
  await browser.close();
  await new Promise(done => probe.server.close(done));
}
