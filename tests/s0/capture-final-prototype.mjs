import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { sceneIds } from '../../apps/web/src/prototypes/demo/scene-data.ts';

const destination = resolve('.omx/prototype-final-staging');
const baseURL = process.env.PROTOTYPE_URL ?? 'http://127.0.0.1:3000';
await mkdir(destination, { recursive: true });
const hashes = {};
async function hashSources(directory) { for (const entry of await readdir(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) await hashSources(path); else hashes[relative(process.cwd(), path).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path)).digest('hex'); } }
await hashSources(resolve('apps/web/src'));
await writeFile(join(destination, 'source-hashes.json'), JSON.stringify(hashes, null, 2));
process.env.TASTE_SKILL_TMP = resolve('.taste-skill/s0-browser-profiles');
await mkdir(process.env.TASTE_SKILL_TMP, { recursive: true });
const browser = await Browser.launch();
const observations = [];
const main = [['chat', '/'], ['files', '/files'], ['login', '/login'], ['welcome', '/welcome'], ['settings', '/settings'], ['preview', '/preview']];
try {
  const page = await browser.newPage();
  for (const width of [1440, 390]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 900 });
    for (const [name, route] of [...main, ...sceneIds.map(id => [`preview-${id}`, `/preview/${id}`])]) {
      page.consoleErrors.length = 0;
      await page.goto(`${baseURL}${route}`, { settleMs: 50 });
      const state = await page.eval(() => ({ heading: document.querySelector('h1')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth }));
      if (!state.heading || state.overflow || page.consoleErrors.length) throw new Error(`${route} ${width}: ${JSON.stringify({ ...state, errors: page.consoleErrors })}`);
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: join(destination, file), format: 'png', fullPage: true });
      observations.push({ route, width, file, ...state });
    }
  }
  for (const width of [768, 1920]) {
    await page.setViewport({ width, height: 1080 });
    for (const [name, route] of main.filter(([name]) => ['chat', 'files', 'settings'].includes(name))) {
      await page.goto(`${baseURL}${route}`, { settleMs: 50 });
      const file = `${name}-${width}.png`;
      const state = await page.eval(() => ({ heading: document.querySelector('h1')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth }));
      if (!state.heading || state.overflow) throw new Error(`${route} ${width}: layout`);
      await page.screenshot({ path: join(destination, file), format: 'png', fullPage: true });
      observations.push({ route, width, file, ...state });
    }
  }
  await writeFile(join(destination, 'observations.json'), JSON.stringify({ capturedAt: new Date().toISOString(), sceneCount: sceneIds.length, observations }, null, 2) + '\n');
  console.log(`Captured ${observations.length} current route/viewport pairs; source hash inventory saved.`);
} finally { await browser.close(); }
