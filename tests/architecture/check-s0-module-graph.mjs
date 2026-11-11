import assert from 'node:assert/strict';
import ts from 'typescript';
import { startProbe } from '../s0/probe-server.mjs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const { server, url } = await startProbe();
const visited = new Set();
let browser;

async function visit(endpoint) {
  if (visited.has(endpoint)) return;

  assert.equal(new URL(endpoint).origin, url, 'Probe smoke must not access an external origin');

  const response = await fetch(endpoint);

  assert.equal(response.status, 200, `Missing probe module: ${endpoint}`);
  assert.match(response.headers.get('content-type'), /javascript/);
  visited.add(endpoint);

  const file = ts.createSourceFile(endpoint, await response.text(), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  for (const node of file.statements) {
    if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;

    const specifier = node.moduleSpecifier.text;

    assert.match(specifier, /^(?:\.{1,2}\/|\/(?!\/))/, `Unmapped bare probe import: ${specifier}`);
    await visit(new URL(specifier, endpoint).href);
  }
}

try {
  for (const path of ['/.env.local', '/apps/web/.env.local', '/__source/apps/web/.env.local']) {
    assert.equal((await fetch(url + path)).status, 404, 'Probe must never expose environment files');
  }

  for (const name of ['folder-session', 'folder-repository', 'record-store', 'record-recovery']) await visit(`${url}/${name}.js`);

  browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });

  const page = await browser.newPage();
  // 원본 선택 UI를 실행하지 않고 같은 origin의 소스 문서에서 모듈 평가만 확인한다.

  await page.goto(`${url}/folder-contracts.js`, { settleMs: 50 });

  const exported = await page.eval(async () => {
    const session = await import('/folder-session.js');
    const repository = await import('/folder-repository.js');
    const preview = await import('/source-file-preview.js');

    return [typeof session.FolderConnectionSession, typeof repository.IndexedDbHandleRepository, typeof preview.readSourceFilePreview];
  });

  assert.deepEqual(exported, ['function', 'function', 'function']);
  assert.deepEqual(page.consoleErrors, []);
  console.log(`S0 module graph: ${visited.size} modules loaded; browser exports verified; no file picker or personal data.`);
} finally {
  if (browser) await browser.close();

  await new Promise(resolve => server.close(resolve));
}
