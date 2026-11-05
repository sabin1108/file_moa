import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import ts from 'typescript';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { ESLint } = requireWeb('eslint');
const webRoot = fileURLToPath(new URL('../../apps/web', import.meta.url));
process.chdir(webRoot);
const eslint = new ESLint({ cwd: webRoot });

// 실제 ESLint 설정을 사용한다. 구경로·타입·재수출·동적 import를 통한 경계 우회도 회귀로 잡는다.
const cases = [
  ['common component cannot depend on feature', 'src/components/ui/check.ts', 'export * from "../../features/local-folders/types";', false],
  ['common layout cannot depend on app', 'src/components/layout/check.ts', 'export * from "../../app/example";', false],
  ['common component cannot depend on prototype', 'src/components/ui/check.ts', 'export * from "../../prototypes/example";', false],
  ['product cannot import unit fixtures outside src', 'src/features/local-folders/check.ts', 'export * from "../../../tests/local-folders/fixture";', false],
  ['product cannot import root browser fixtures', 'src/components/ui/check.ts', 'export * from "../../../../../tests/fixtures/folder-browser-fixture.mjs";', false],
  ['product cannot import extensionless test modules', 'src/features/local-folders/check.ts', 'export * from "./example.test";', false],
  ['feature cannot import prototype UI', 'src/features/local-folders/ui/check.ts', 'import { value } from "../../../prototypes/components/example"; export { value };', false],
  ['feature cannot import legacy prototype path', 'src/features/local-folders/check.ts', 'export { value } from "../prototype/components/example";', false],
  ['live page cannot import prototype CSS', 'src/app/(workspace)/files/check.ts', 'import "../../../prototypes/styles/example.module.css";', false],
  ['live page cannot import fixture types', 'src/app/(workspace)/check.ts', 'export type { Sample } from "../../prototypes/prototype-data";', false],
  ['dynamic import cannot bypass boundary', 'src/features/local-folders/check.ts', 'export const load = () => import("../../prototypes/demo/example");', false],
  ['import type cannot bypass boundary', 'src/features/local-folders/check.ts', 'export type Sample = import("../../prototypes/prototype-data").Sample;', false],
  ['shared cannot depend on feature', 'src/shared/ui/check.ts', 'export * from "../../features/local-folders/contracts";', false],
  ['shared cannot depend on app', 'src/shared/ui/check.ts', 'export * from "../../app/example";', false],
  ['shared cannot depend on prototype', 'src/shared/ui/check.ts', 'export * from "../../prototypes/example";', false],
  ['features cannot depend on route', 'src/features/local-folders/check.ts', 'export * from "../../app/example";', false],
  ['normalized relative segments cannot bypass', 'src/features/local-folders/check.ts', 'export * from "../../shared/../prototypes/example";', false],
  ['server cannot import prototype', 'src/server/check.ts', 'import "server-only"; export * from "../prototypes/example";', false],
  ['server cannot import browser feature', 'src/server/check.ts', 'import "server-only"; export * from "../features/local-folders/contracts";', false],
  ['preview routes may compose prototypes', 'src/app/preview/check.ts', 'export * from "../../prototypes/demo/example";', true],
  ['prototype may demonstrate a feature', 'src/prototypes/demo/check.ts', 'export * from "../../features/local-folders/components/connection/SourceFolderConnection";', true],
  ['feature may use common UI', 'src/features/local-folders/components/connection/check.ts', 'export * from "../../../../components/ui/ActionLink";', true],
  ['common UI may use common CSS', 'src/components/ui/check.ts', 'import "../../styles/controls.module.css";', true],
  ['route may compose feature', 'src/app/(workspace)/files/check.ts', 'export * from "../../../features/local-folders/components/listing/SourceFolderBrowser";', true],
  ['feature may use domain rules', 'src/features/local-folders/services/check.ts', 'export { checkDocumentCandidate } from "@personal-ai/domain";', true],
];

for (const [name, filePath, code, allowed] of cases) {
  const [result] = await eslint.lintText(code, { filePath: `${webRoot}/${filePath}` });
  assert.equal(result.fatalErrorCount, 0, `${name}: invalid test syntax`);
  const violations = result.messages.filter(message => message.ruleId === 'structure/feature-boundary');
  assert.equal(violations.length === 0, allowed, `${name}: ${JSON.stringify(violations)}`);
}
const filesUnder = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(join(root, entry.name)) : [join(root, entry.name)]);
const sourceFiles = filesUnder(`${webRoot}/src`);
assert.deepEqual(sourceFiles.filter(file => /\.(test|spec)\.[^.]+$/.test(file)), [], 'Product src must not contain tests');
const routeNames = /^(page|layout|route|template|loading|error|global-error|not-found|default)\.(ts|tsx)$|^(icon|favicon)\.(svg|ico|png)$/;
assert.deepEqual(filesUnder(`${webRoot}/src/app`).filter(file => !routeNames.test(file.split(/[\\/]/).at(-1))), [], 'Keep app limited to route entrypoints and metadata');
// domain은 웹 ESLint 범위 밖이므로 실제 TS 모듈 참조도 별도로 확인한다.
const domainRoot = resolve(webRoot, '../../packages/domain/src');
const domainFiles = filesUnder(domainRoot);
assert.deepEqual(domainFiles.filter(file => /\.(test|spec)\.[^.]+$/.test(file)), [], 'Domain src must not contain tests');
function hasTestImport(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let found = false;
  function visit(node) {
    const module = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0]
      : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
    if (module && ts.isStringLiteral(module)) {
      const target = resolve(dirname(file), module.text).replaceAll('\\', '/');
      if (module.text === 'vitest' || target.split('/').includes('tests') || /\.(test|spec)(?:\.[^.]+)?$/.test(target)) found = true;
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); return found;
}
const domainCases = [
  ['export * from "../tests/example";', true],
  ['export const load = () => import("../tests/example");', true],
  ['export type T = import("../tests/example").T;', true],
  ['import { expect } from "vitest";', true],
  ['export * from "./example.test";', true],
  ['export * from "./local-record";', false],
];
for (const [source, expected] of domainCases) assert.equal(hasTestImport(source, join(domainRoot, 'check.ts')), expected);
for (const file of domainFiles.filter(file => file.endsWith('.ts'))) assert.equal(hasTestImport(readFileSync(file, 'utf8'), file), false, `Domain product imports tests: ${file}`);
console.log(`Structure: ${cases.length} web import fixtures, ${domainCases.length} domain import fixtures, 3 layout checks and actual domain imports passed (not authorization).`);
