import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const require = createRequire(import.meta.resolve('vitest'));
const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
const output = process.argv[2] ?? '.omx/verification/paid-ai-demo-20261116/browser';
mkdirSync(output, { recursive: true });
const server = await createServer({ configFile: false, root: resolve('apps/web'), logLevel: 'error', cacheDir: resolve('.omx/browser-cache/paid-demo'),
  server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve('.')] } },
  resolve: { dedupe: ['react', 'react-dom'], alias: { 'next/image': resolve('tests/fixtures/image-next-shim.tsx'), 'next/link': resolve('tests/fixtures/navigation-next-shim.tsx'), 'next/navigation': resolve('tests/fixtures/navigation-next-shim.tsx'), '@personal-ai/domain': resolve('packages/domain/src/index.ts') } },
  oxc: { jsx: { runtime: 'automatic' } }, optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'tesseract.js', 'pdfjs-dist/legacy/build/pdf.mjs'] },
  plugins: [{ name: 'paid-demo-fixture', configureServer(vite) { vite.middlewares.use('/demo', (_req, res) => {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/paid-demo.tsx"></script></html>');
  }); } }],
});
await server.listen();
const browser = await Browser.launch({ extraArgs: ['--disable-gpu', '--no-sandbox'] });
const checks = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
const wait = async (page, predicate) => { for (let i = 0; i < 200; i++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await new Promise(done => setTimeout(done, 50)); } throw Error(`Timeout: ${predicate}`); };
const click = (page, selector) => page.eval(selector => { const node = document.querySelector(selector); if (!node) throw Error(`Missing ${selector}`); node.click(); }, selector);
const choose = (page, mode) => page.eval(mode => { const input = document.querySelector('select[aria-label="대화 작업"]'); input.value = mode; input.dispatchEvent(new Event('change', { bubbles: true })); }, mode);
const fill = async (page, text) => { await page.eval(() => { const input = document.getElementById('message-draft'); input.focus(); input.select(); }); await page.send('Input.insertText', { text }); };
const send = async page => { await wait(page, () => !document.querySelector('[data-action="organization-send"]')?.disabled); await click(page, '[data-action="organization-send"]'); };
const close = async page => { await click(page, '[data-drawer-close]'); await wait(page, () => !document.getElementById('conversation-materials')?.open); };
let page;
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/demo`;
  await page.goto(url, { settleMs: 400 });
  await wait(page, () => document.querySelector('[data-tour="task-chat"]'));
  check('mount and restored state generate no automatic requests', await page.eval(() => paidDemo.answers.length === 0 && paidDemo.organizations === 0));
  await click(page, '[data-tour="task-chat"]');
  await page.eval(() => { document.querySelector('[aria-label="현재 대화 작업"] details').open = true; });
  await click(page, '[data-task-example="chat"]');
  check('input examples fill the draft without generation', await page.eval(() => paidDemo.answers.length === 0 && document.getElementById('message-draft').value.length > 0));
  await send(page);
  await wait(page, () => paidDemo.store.getSnapshot().state.messages.length === 2);
  check('chat send calls the supplied server action exactly once and labels the actual model', await page.eval(() => paidDemo.answers.length === 1 && document.body.textContent.includes('gpt-6-luna')));
  await fill(page, '최근 질문을 이어서 설명해줘');
  await send(page);
  await wait(page, () => paidDemo.store.getSnapshot().state.messages.length === 4);
  check('a followup sends a bounded completed conversation without another chat checkbox', await page.eval(() => paidDemo.answers.length === 2 && paidDemo.answers[1].messages.length === 3 && !document.querySelector('[data-demo-ai-consent]')));
  await page.eval(() => { paidDemo.failure = 'limit'; });
  await fill(page, '한도 확인 질문'); await send(page);
  await wait(page, () => !!paidDemo.store.getSnapshot().notice);
  check('failure keeps the question and adds no prepared answer', await page.eval(() => paidDemo.store.getSnapshot().state.messages.length === 4 && paidDemo.store.getSnapshot().state.draft === '한도 확인 질문'));
  await page.eval(() => { paidDemo.failure = null; });
  await choose(page, 'find'); await fill(page, '회의 찾아줘'); await send(page);
  await wait(page, () => document.querySelector('[aria-label="샘플 검색 결과"]'));
  check('local find still uses no AI action', await page.eval(() => paidDemo.answers.length === 3 && paidDemo.store.getSnapshot().state.findings.length === 42));
  await close(page); await choose(page, 'grounded');
  await wait(page, () => document.getElementById('conversation-materials')?.open);
  await click(page, '[data-previewing] input[type="checkbox"]');
  await click(page, '[data-grounded-selection-done]');
  await wait(page, () => !document.getElementById('conversation-materials')?.open);
  await fill(page, '선택 자료의 핵심을 알려줘');
  check('grounded transmission requires explicit source consent', await page.eval(() => document.querySelector('[data-action="organization-send"]').disabled));
  await click(page, '[data-demo-ai-consent]'); await send(page);
  await wait(page, () => paidDemo.store.getSnapshot().state.citations.length === 1);
  check('grounded sends document IDs and receives an AI answer with selected-source citations', await page.eval(() => paidDemo.answers.length === 4 && paidDemo.answers[3].documentIds.length === 1 && !('excerpt' in paidDemo.answers[3])));
  await close(page);
  await page.eval(() => paidDemo.store.dispatch({ type: 'select', ids: Array.from({ length: 41 }, (_, index) => `doc-${index + 1}`) }));
  await fill(page, '너무 많은 자료');
  check('oversized selection is explained and cannot be sent', await page.eval(() => document.body.textContent.includes('최대 40개') && document.querySelector('[data-action="organization-send"]').disabled));
  await page.eval(() => paidDemo.store.dispatch({ type: 'select', ids: ['doc-1'] }));
  await fill(page, '취소할 질문');
  await click(page, '[data-demo-ai-consent]');
  await page.eval(() => { paidDemo.hold = true; }); await send(page);
  await wait(page, () => paidDemo.store.getSnapshot().aiPending);
  const messagesBeforeCancel = await page.eval(() => paidDemo.store.getSnapshot().state.messages.length);
  await page.eval(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === '응답 대기 취소').click());
  await page.eval(() => paidDemo.resolve.splice(0).forEach(resolve => resolve()));
  await wait(page, () => !paidDemo.store.getSnapshot().aiPending);
  check('cancelled late answers are not stored', await page.eval(before => paidDemo.store.getSnapshot().state.messages.length === before, messagesBeforeCancel));
  await page.eval(() => { paidDemo.hold = false; });
  await choose(page, 'organize'); await fill(page, '회의 자료를 정리해줘');
  await click(page, '[data-demo-ai-consent]'); await send(page);
  await wait(page, () => paidDemo.store.getSnapshot().state.phase === 'review');
  check('organize send uses the AI action and waits for explicit plan application', await page.eval(() => paidDemo.organizations === 1 && paidDemo.store.getSnapshot().state.lastApplied === null));
  await click(page, '[data-action="sample-apply"]');
  await wait(page, () => paidDemo.store.getSnapshot().state.phase === 'result');
  await close(page); await choose(page, 'grounded');
  await page.eval(() => document.querySelector('[data-conversation-context] button').click());
  await wait(page, () => document.getElementById('conversation-materials')?.open);
  await click(page, '[data-previewing] input[type="checkbox"]');
  check('explicit source changes after an applied plan keep the undo journal and unlock selection', await page.eval(() => paidDemo.store.getSnapshot().state.phase === 'select' && !!paidDemo.store.getSnapshot().state.lastApplied));
  await close(page);
  await click(page, '[data-tour="settings"]');
  await wait(page, () => document.querySelector('[aria-label="대화 설정 내용"]')?.checkVisibility());
  check('settings show the connected provider', await page.eval(() => document.querySelector('[aria-label="대화 설정 내용"]').textContent.includes('OpenAI')));
  await page.eval(() => [...document.querySelectorAll('[aria-label="대화 설정 내용"] button')].find(button => button.textContent === '사용 방법 다시 보기').click());
  await wait(page, () => document.querySelector('#workspace-tour-title'));
  check('tutorial replay starts no AI request', await page.eval(() => paidDemo.answers.length === 5 && paidDemo.organizations === 1));
  await click(page, 'dialog[aria-labelledby="workspace-tour-title"] section > div:last-child button:first-child');
  await wait(page, () => !document.querySelector('#workspace-tour-title'));
  for (const width of [390, 768, 1440]) {
    await page.setViewport({ width, height: 1000 });
    check(`${width}: paid demo controls do not overflow`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/paid-${width}.png`, fullPage: true, format: 'png' });
  }
  await page.goto(url, { settleMs: 400 }); await wait(page, () => document.querySelector('select[aria-label="대화 작업"]'));
  check('refresh restores answers without replaying any AI call', await page.eval(() => paidDemo.answers.length === 0 && paidDemo.organizations === 0 && paidDemo.store.getSnapshot().state.messages.some(message => message.model === 'gpt-6-luna')));
  check('the product UI has no browser exceptions', page.consoleErrors.length === 0);
} catch (error) {
  checks.push({ name: 'run', passed: false, detail: String(error) }); process.exitCode = 1;
  if (page) writeFileSync(`${output}/failure.json`, JSON.stringify({ text: await page.eval(() => document.body.innerText.slice(-4500)), errors: page.consoleErrors }, null, 2));
} finally {
  writeFileSync(`${output}/checks.json`, JSON.stringify(checks, null, 2)); console.log(JSON.stringify(checks, null, 2));
  await browser.close(); await server.close();
}
