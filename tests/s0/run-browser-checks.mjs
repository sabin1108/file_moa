import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { startProbe } from './probe-server.mjs';

// Isolated profile under the ignored workspace directory; never attaches to a personal browser.

process.env.TASTE_SKILL_TMP = resolve('.taste-skill/s0-browser-profiles');
await mkdir(process.env.TASTE_SKILL_TMP, { recursive: true });

const { server, url } = await startProbe();
let browser;

function stopOwnedChrome(child) {
  if (child.exitCode !== null || child.signalCode !== null || !Number.isSafeInteger(child.pid)) return;

  if (process.platform === 'win32') spawnSync(
    'taskkill',
    ['/PID', String(child.pid), '/T', '/F'],
    { stdio: 'ignore', windowsHide: true }
  );
  else child.kill('SIGKILL');
}

async function restartIsolatedBrowser() {
  const local = relative(process.env.TASTE_SKILL_TMP, browser.dir);

  assert.ok(
    local && !local.startsWith('..') && !isAbsolute(local),
    'Restart only the profile created by this test'
  );

  const args = browser.proc.spawnargs.slice(1);

  assert.ok(args.includes(`--user-data-dir=${browser.dir}`));
  assert.equal(browser.pending.size, 0);

  const receive = browser.ws.onmessage;
  const stopped = once(browser.proc, 'exit');
  let timer;

  try {
    await browser.send('Browser.close', {}, undefined, 10_000);
    await Promise.race([stopped, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Isolated Chrome exit timeout')), 10_000);
    })]);
  } catch (error) {
    stopOwnedChrome(browser.proc);

    throw error;
  } finally {
    clearTimeout(timer);
  }

  browser.ws.close();
  browser.listeners.clear();

  const child = spawn(browser.proc.spawnfile, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  browser.proc = child;

  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;

      try {
        stopOwnedChrome(child);
      } catch { }
    }
  };

  for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP']) process.prependOnceListener(signal, cleanup);

  child.once('exit', () => {
    for (const signal of ['exit', 'SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(signal, cleanup);
  });

  const ownerFile = resolve(browser.dir, 'taste-skill-owner.json');
  const owner = JSON.parse(await readFile(ownerFile, 'utf8'));

  await writeFile(ownerFile, JSON.stringify({ ...owner, chrome: child.pid }));

  const endpoint = await new Promise((done, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(Error('Isolated Chrome restart timeout')), 20_000);

    child.stderr.on('data', chunk => {
      text += chunk.toString();

      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/u);

      if (match) {
        clearTimeout(timer);
        done(match[1]);
      }
    });
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(Error('Isolated Chrome exited during restart'));
    });
  });

  browser.ws = new WebSocket(endpoint);
  await new Promise((done, reject) => {
    browser.ws.onopen = done;
    browser.ws.onerror = () => reject(Error('Restarted CDP connection failed'));
  });
  browser.ws.onmessage = receive;
}

try {
  browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });

  const page = await browser.newPage();

  await page.goto(url);

  const result = await page.eval(async () => (await import('/browser-checks.mjs')).runChecks());

  result.recovery = await page.eval(async () => (await import('/recovery-checks.mjs')).runRecoveryChecks());
  result.accountConnections = await page.eval(async () => (await import('/account-connection-checks.mjs')).runAccountConnectionChecks());
  await page.goto(url);
  result.reloadRead = await page.eval(async () => {
    const { restoreHandle } = await import('/browser-checks.mjs');
    const { loadLatest } = await import('/record-store.js');

    return (await loadLatest(await restoreHandle(), 's0-record')).body === 'previous good body';
  });

  if (!result.reloadRead) throw new Error('Reload handle read failed');

  const sharedName = `cross-tab-${crypto.randomUUID()}`;

  await page.eval(async name => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
    const { saveRevision } = await import('/record-store.js');

    await saveRevision(
      directory,
      {
        recordId: 'cross-tab',
        revisionId: 'r1',
        parentRevisionId: null,
        kind: 'artifact',
        scope: { type: 'global' },
        state: 'draft',
        createdAt: '2026-10-25T00:00:00.000Z'
      },
      'base'
    );
  }, sharedName);

  const second = await browser.newPage();

  await second.goto(url);

  const compete = async ({ name, revision }) => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    const { saveRevision } = await import('/record-store.js');

    try {
      await saveRevision(
        directory,
        {
          recordId: 'cross-tab',
          revisionId: revision,
          parentRevisionId: 'r1',
          kind: 'artifact',
          scope: { type: 'global' },
          state: 'draft',
          createdAt: '2026-10-25T00:00:00.000Z'
        },
        revision
      );

      return 'saved';
    } catch (error) {
      return error.message;
    }
  };

  result.twoTabs = await Promise.all([page.eval(compete, { name: sharedName, revision: 'tab-a' }), second.eval(compete, { name: sharedName, revision: 'tab-b' })]);

  if (result.twoTabs.filter(value => value === 'saved').length !== 1 || !result.twoTabs.includes('stale-revision')) throw new Error('Cross-tab conflict not rejected');

  result.probeUi = await page.eval(async () => (await import('/probe-ui-checks.mjs')).runProbeUiChecks());
  await page.goto(url);
  result.probeReload = await page.eval(async () => {
    await import('/probe.mjs');

    return JSON.parse(document.querySelector('#output').textContent).state === 'reconnect-needed'
      && !document.querySelector('#restore').disabled
      && document.querySelector('#recover').disabled;
  });

  if (!result.probeReload) throw new Error('Probe did not preload the recovered connection after reload');

  await restartIsolatedBrowser();

  const reopened = await browser.newPage();

  await reopened.goto(url);
  result.processRestart = await reopened.eval(async () => {
    const { restoreHandle } = await import('/handle-store.mjs');
    const { loadLatest } = await import('/record-store.js');
    const handle = await restoreHandle();
    const latest = await loadLatest(handle, 's0-record');

    return {
      handleRestored: !!handle,
      body: latest.body,
      revisionId: latest.metadata.revisionId,
      permission: await handle.queryPermission({ mode: 'read' })
    };
  });
  assert.deepEqual(
    result.processRestart,
    {
      handleRestored: true,
      body: '# 저장 검증\n개인정보 없는 합성 문서입니다.',
      revisionId: 'r1',
      permission: 'granted'
    }
  );
  result.condition = 'Actual isolated Chrome process exit/restart, IndexedDB handles and OPFS; synthetic owners/picker/permissions; no user Chrome or Windows-selected folder.';
  result.verifiedAt = new Date().toISOString();

  const label = process.env.CHROME_PATH?.toLowerCase().includes('msedge') ? 'edge' : 'chrome';
  const output = process.argv[2] ?? 'docs/verification/s0';

  await mkdir(output, { recursive: true });
  await writeFile(`${output}/${label}-storage.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();

  await new Promise(resolveClose => server.close(resolveClose));
}
