// Test-only module server. Serves a closed graph from the real session entry, never a product route.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

export async function startBackupProbe() {
  const webRequire = createRequire(resolve('apps/web/package.json'));
  const zod = join(dirname(webRequire.resolve('zod/package.json')), 'index.js');
  const modules = new Map();
  const urls = new Map();
  function load(path) {
    path = resolve(path);
    if (urls.has(path)) return urls.get(path);
    const url = `/module-${urls.size}.js`;
    urls.set(path, url);
    let source = readFileSync(path, 'utf8');
    if (path.endsWith('.ts')) source = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    // Match the production bundler's classic-worker output: remove the TS-only empty module marker.
    if (path.endsWith('.worker.ts')) source = source.replace(/export\s*\{\s*\};?/u, '');
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const edits = [];
    const visit = node => {
      let literal;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) literal = node.moduleSpecifier;
      if (ts.isNewExpression(node) && node.expression.getText(ast) === 'URL' && node.arguments?.[0] && ts.isStringLiteral(node.arguments[0])) literal = node.arguments[0];
      if (literal && ts.isStringLiteral(literal)) {
        const specifier = literal.text;
        let target;
        if (specifier === 'zod') target = zod;
        else if (specifier === '@personal-ai/domain') target = resolve('packages/domain/src/index.ts');
        else if (specifier.startsWith('.')) {
          const candidate = resolve(dirname(path), specifier);
          target = [candidate, candidate + '.ts', candidate + '.js', join(candidate, 'index.ts')].find(existsSync);
        } else throw Error(`Unexpected external probe import ${specifier}`);
        if (!target) throw Error(`Unresolved probe import ${specifier}`);
        edits.push({ start: literal.getStart(ast), end: literal.end, text: JSON.stringify(load(target)) });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
    modules.set(url, source);
    return url;
  }
  const entry = load(resolve('apps/web/src/features/local-folders/services/connection-session.ts'));
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const body = path === '/' ? '<!doctype html><title>Isolated recovery backup probe</title>' : modules.get(path);
    if (body === undefined) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': path === '/' ? 'text/html' : 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(body);
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  return { server, entry, url: `http://127.0.0.1:${server.address().port}`, moduleCount: modules.size };
}
