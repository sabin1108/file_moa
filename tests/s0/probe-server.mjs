import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, relative, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const files = new Map([
  ['/', ['probe.html', 'text/html; charset=utf-8']],
  ['/probe.mjs', ['probe.mjs', 'text/javascript']],
  ['/probe-connection.mjs', ['probe-connection.mjs', 'text/javascript']],
  ['/source-inventory.mjs', ['source-inventory.mjs', 'text/javascript']],
  ['/handle-store.mjs', ['handle-store.mjs', 'text/javascript']],
  ['/probe-ui-checks.mjs', ['probe-ui-checks.mjs', 'text/javascript']],
  ['/account-connection-checks.mjs', ['account-connection-checks.mjs', 'text/javascript']],
  ['/folder-contracts.js', ['../../apps/web/src/features/local-folders/lib/connection-validation.ts', 'text/javascript']],
  ['/folder-session.js', ['../../apps/web/src/features/local-folders/services/connection-session.ts', 'text/javascript']],
  ['/source-folder-listing.js', ['../../apps/web/src/features/local-folders/services/source-folder-listing.ts', 'text/javascript']],
  ['/source-file-preview.js', ['../../apps/web/src/features/local-folders/services/source-file-preview.ts', 'text/javascript']],
  ['/document-rules.js', ['../../packages/domain/src/index.ts', 'text/javascript']],
  ['/folder-repository.js', ['../../apps/web/src/features/local-folders/services/handle-repository.ts', 'text/javascript']],
  ['/browser-checks.mjs', ['browser-checks.mjs', 'text/javascript']],
  ['/record-store.js', ['../../apps/web/src/features/ai-records/services/record-store.ts', 'text/javascript']],
  ['/record-recovery.js', ['../../apps/web/src/features/ai-records/services/record-recovery.ts', 'text/javascript']],
  ['/recovery-checks.mjs', ['recovery-checks.mjs', 'text/javascript']],
  ['/local-record.js', ['../../packages/domain/src/local-record.ts', 'text/javascript']],
]);

// 제공할 파일과 import 연결은 명시적으로 제한한다. 요청 경로를 디스크 경로로 해석하지 않는다.
const moduleUrls = new Map([
  ['../../packages/domain/src/local-record', './local-record.js'],
  ['./local-record', './local-record.js'],
  ['./record-store', './record-store.js'],
  ['../contracts', './folder-contracts.js'],
  ['../lib/connection-validation', './folder-contracts.js'],
  ['../browser/source-folder-listing', './source-folder-listing.js'],
  ['./source-folder-listing', './source-folder-listing.js'],
  ['../browser/source-file-preview', './source-file-preview.js'],
  ['./source-file-preview', './source-file-preview.js'],
  ['@personal-ai/domain', './document-rules.js'],
]);

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const allowedRoots = ['apps/web/src/features/local-folders/', 'apps/web/src/features/ai-records/services/', 'apps/web/src/shared/', 'packages/domain/src/'];
const webRequire = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const zodRoot = dirname(webRequire.resolve('zod/package.json'));

function moduleUrl(specifier, sourceUrl) {
  const known = moduleUrls.get(specifier);

  if (known) return '/' + known.replace(/^\.\//, '');

  const fixtureEndpoint = '/' + specifier.replace(/^\.\//, '');

  if (sourceUrl.href.startsWith(new URL('./', import.meta.url).href) && files.has(fixtureEndpoint)) return fixtureEndpoint;

  if (specifier === 'zod') {
    files.set(
      '/vendor/zod/index.js',
      [pathToFileURL(resolve(zodRoot, 'index.js')).href, 'text/javascript']
    );

    return '/vendor/zod/index.js';
  }

  if (!specifier.startsWith('.')) return null;

  const target = new URL(specifier, sourceUrl);

  if (!/\.(ts|js|mjs)$/u.test(target.pathname)) target.pathname += '.ts';

  const path = resolve(fileURLToPath(target));

  if (path.startsWith(zodRoot + sep) && existsSync(path)) {
    const endpoint = '/vendor/zod/' + relative(zodRoot, path).split(sep).join('/');

    files.set(endpoint, [target.href, 'text/javascript']);

    return endpoint;
  }

  const local = relative(repositoryRoot, path).split(sep).join('/');

  if (!allowedRoots.some(root => local.startsWith(root)) || !existsSync(path)) throw new Error('Unmapped probe source dependency');

  const endpoint = '/__source/' + local.replace(/\.ts$/u, '.js');

  files.set(endpoint, [target.href, 'text/javascript']);

  return endpoint;
}

function rewriteProbeImports(source, sourceUrl) {
  const file = ts.createSourceFile('probe.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = file.statements.flatMap(node => {
    if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) return [];

    const target = moduleUrl(node.moduleSpecifier.text, sourceUrl);

    return target
      ? [{
        start: node.moduleSpecifier.getStart(file),
        end: node.moduleSpecifier.end,
        text: JSON.stringify(target)
      }]
      : [];
  });
  // 뒤에서부터 바꿔 AST 위치를 보존하고, 코드의 다른 문자열에는 손대지 않는다.

  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);

  return source;
}

export async function startProbe(port = 0) {
  const server = createServer(async (request, response) => {
    const entry = files.get(new URL(request.url, 'http://localhost').pathname);

    if (!entry) {
      response.writeHead(404).end();

      return;
    }

    try {
      const sourceUrl = new URL(entry[0], import.meta.url);
      let source = await readFile(sourceUrl, 'utf8');

      if (entry[0].endsWith('.ts')) source = rewriteProbeImports(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText, sourceUrl);
      else if (entry[1] === 'text/javascript') source = rewriteProbeImports(source, sourceUrl);

      response.writeHead(
        200,
        { 'Content-Type': entry[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
      );
      response.end(source);
    } catch {
      response.writeHead(500).end('Probe source unavailable');
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });

  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startProbe(4318);

  console.log(`S0 manual probe: ${url} (local only; no AI/API requests)`);
}
