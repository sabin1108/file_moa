import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { startProbe } from './probe-server.mjs';

// Isolated profile under the ignored workspace directory; never attaches to a personal browser.
process.env.TASTE_SKILL_TMP = resolve('.taste-skill/s0-browser-profiles');
await mkdir(process.env.TASTE_SKILL_TMP, { recursive: true });
const { server, url } = await startProbe();
let browser;
try {
  browser = await Browser.launch();
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
    await saveRevision(directory, { recordId: 'cross-tab', revisionId: 'r1', parentRevisionId: null, kind: 'artifact', scope: { type: 'global' }, state: 'draft', createdAt: '2026-10-25T00:00:00.000Z' }, 'base');
  }, sharedName);
  const second = await browser.newPage(); await second.goto(url);
  const compete = async ({ name, revision }) => {
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    const { saveRevision } = await import('/record-store.js');
    try {
      await saveRevision(directory, { recordId: 'cross-tab', revisionId: revision, parentRevisionId: 'r1', kind: 'artifact', scope: { type: 'global' }, state: 'draft', createdAt: '2026-10-25T00:00:00.000Z' }, revision);
      return 'saved';
    } catch (error) { return error.message; }
  };
  result.twoTabs = await Promise.all([page.eval(compete, { name: sharedName, revision: 'tab-a' }), second.eval(compete, { name: sharedName, revision: 'tab-b' })]);
  if (result.twoTabs.filter(value => value === 'saved').length !== 1 || !result.twoTabs.includes('stale-revision')) throw new Error('Cross-tab conflict not rejected');
  result.probeUi = await page.eval(async () => (await import('/probe-ui-checks.mjs')).runProbeUiChecks());
  await page.goto(url);
  result.probeReload = await page.eval(async () => {
    await import('/probe.mjs');
    return JSON.parse(document.querySelector('#output').textContent).state === 'reconnect-needed'
      && !document.querySelector('#restore').disabled && document.querySelector('#recover').disabled;
  });
  if (!result.probeReload) throw new Error('Probe did not preload the recovered connection after reload');
  result.verifiedAt = new Date().toISOString();
  const label = process.env.CHROME_PATH?.toLowerCase().includes('msedge') ? 'edge' : 'chrome';
  await mkdir('docs/verification/s0', { recursive: true });
  await writeFile(`docs/verification/s0/${label}-storage.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { if (browser) await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
