import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const label = process.argv[2];

if (!['before', 'after'].includes(label)) throw new Error('Use before or after');

const base = process.argv[3] || 'http://127.0.0.1:3001';
const out = process.argv[4] || 'docs/verification/settings-folder-connection';
const width = Number(process.argv[5] || 1440);
const routes = ['/', '/files', '/settings', '/login', '/welcome'];
const selectedRoute = process.argv[6];

if (selectedRoute
  && ![...routes, '/forgot-password', '/verify-email', '/reset-password', '/account'].includes(selectedRoute)) throw new Error('Unknown route');

if (![390, 1440].includes(width)) throw new Error('Viewport must be 390 or 1440');

mkdirSync(out, { recursive: true });

const files = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(path, entry.name)) : [join(path, entry.name)]);
const hash = createHash('sha256');

for (const file of files('apps/web/src').sort()) hash.update(file).update(readFileSync(file));

const staticBytes = files('apps/web/.next/static').reduce((total, file) => total + statSync(file).size, 0);
const browser = await Browser.launch();
const samples = [];

try {
  for (const route of selectedRoute ? [selectedRoute] : routes) {
    for (let run = 1; run <= 3; run++) {
      const page = await browser.newPage({ width, height: 900 });

      await page.send('Network.enable');
      await page.send('Network.setCacheDisabled', { cacheDisabled: true });
      await page.send('Performance.enable');
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
        window.lab = { lcp: null, cls: 0, longTasks: [] };
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.lab.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver(list => { for (const e of list.getEntries()) window.lab.longTasks.push(e.duration); }).observe({ type: 'longtask', buffered: true });
      `
      });
      await page.goto(base + route, { settleMs: 1200 });

      const data = await page.eval(() => {
        const entries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')];

        return {
          ...window.lab,
          observedPath: location.pathname,
          transferBytes: entries.reduce((sum, e) => sum + e.transferSize, 0),
          jsBytes: entries.filter(e => /\.js(?:\?|$)/.test(e.name)).reduce((sum, e) => sum + e.transferSize, 0),
          requests: entries.length,
          loadMs: performance.getEntriesByType('navigation')[0].loadEventEnd
        };
      });
      const { metrics } = await page.send('Performance.getMetrics');

      samples.push({
        route,
        run,
        ...data,
        heapBytes: metrics.find(m => m.name === 'JSHeapUsedSize')?.value,
        errors: page.consoleErrors
      });
      await page.close();
    }
  }

  const version = await browser.send('Browser.getVersion');

  writeFileSync(
    `${out}/performance-${label}${width === 390 ? '-mobile' : ''}.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        label,
        base,
        sourceSha256: hash.digest('hex'),
        staticBytes,
        browser: version.product,
        conditions: `production; Windows; ${width}x900; no CPU/network throttling; HTTP cache disabled; same browser profile with new tab per run; 1.2s observation after load; no auth/model/API; three runs per route; LCP/CLS from PerformanceObserver, not Lighthouse; no field INP/TBT measurement`,
        samples
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ label, samples: samples.length, staticBytes }));
} finally {
  await browser.close();
}
