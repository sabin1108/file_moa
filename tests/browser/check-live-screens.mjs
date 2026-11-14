import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { probe, layout, app } from '../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs';
import { judge, judgeLayout, judgeApp, APP_SKIP } from '../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3034';
const out = process.argv[3] || '.omx/verification/live-workspace';
mkdirSync(out, { recursive: true });

const checks = [];
const visualFindings = [];
const browser = await Browser.launch({ extraArgs: ['--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer', '--no-sandbox'] });

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  assert.ok(passed, name);
}

try {
  for (const route of ['/', '/files', '/settings', '/login', '/welcome']) {
    const page = await browser.newPage({ width: 1440, height: 1000 });
    const destination = ['/', '/files', '/settings'].includes(route) ? '/login' : route;

    await page.goto(base + route, { settleMs: 300 });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await page.eval(path => location.pathname === path && !!document.querySelector('[data-auth-shell]'), destination)) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    check(
      `${route}: anonymous visitor reaches the real authentication screen`,
      await page.eval(path => location.pathname === path && !!document.querySelector('[data-auth-shell]'), destination)
    );
    check(
      `${route}: no protected data, sample workspace or retired preview menu`,
      await page.eval(() => !document.querySelector('[data-listing-phase], [data-conversation-context], [data-workspace="sample"], a[href^="/preview"]'))
    );
    if (destination === '/login') {
      check(
        `${route}: real email and password form is available`,
        await page.eval(() => !!document.querySelector('form[data-auth-form] input[type="email"]') && !!document.querySelector('form[data-auth-form] input[type="password"]'))
      );
    }

    for (const width of [1440, 1920, 768, 390]) {
      await page.setViewport({ width, height: 1000 });
      check(`${route} ${width}: no horizontal overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
      const measured = await page.eval(probe);
      const findings = [...judge(measured, { width }), ...judgeLayout(await page.eval(layout), { width })]
        .filter(finding => !APP_SKIP.has(finding.id) && finding.id !== 'no-title' && finding.id !== 'small-title');
      findings.push(...judgeApp(await page.eval(app), measured, { width }));
      visualFindings.push({ route, width, findings });
      await page.screenshot({ path: `${out}/${route.slice(1) || 'root'}-${width}.png`, format: 'png', fullPage: true });
    }

    if (route === '/login') {
      await page.eval(() => document.querySelector('input[type="email"]').focus());
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      check('login: Tab reaches the password field', await page.eval(() => document.activeElement?.getAttribute('type') === 'password'));
    }

    check(`${route}: no browser exception`, page.consoleErrors.length === 0, page.consoleErrors);
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${out}/screen-checks.json`, JSON.stringify({
    at: new Date().toISOString(), base, checks, visualFindings,
    condition: 'Anonymous production routes in an isolated browser. Authenticated forms and cookies belong to the isolated database/auth UI suite; no personal credentials or folders.',
  }, null, 2));
}

console.log(JSON.stringify({ checks: checks.length, failed: checks.filter(check => !check.passed).length }));
