import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { ESLint } = requireWeb('eslint');
const webRoot = fileURLToPath(new URL('../../apps/web', import.meta.url));

process.chdir(webRoot);

const eslint = new ESLint({ cwd: webRoot });
const boundaryRules = new Set([
  'project/server-boundary', 'no-restricted-globals', 'no-restricted-properties', 'no-restricted-imports',
]);

// Adversarial snippets exercise the actual repository ESLint configuration, not a copy of its rules.
const cases = [
  ['UI direct fetch', 'src/features/check.ts', 'export const load = () => fetch("/api/private");', false],
  ['fixed demo stream', 'src/features/sample-workspace/sample-stream.ts', 'export const load = () => fetch("/demo/stream", { method: "POST", credentials: "same-origin", redirect: "error" });', true],
  ['demo cannot access other endpoints', 'src/features/sample-workspace/sample-stream.ts', 'export const load = () => fetch("/api/chat", { method: "POST", credentials: "same-origin", redirect: "error" });', false],
  ['demo cannot alias fetch', 'src/features/sample-workspace/sample-stream.ts', 'export const load = fetch;', false],
  ['demo cannot follow redirects', 'src/features/sample-workspace/sample-stream.ts', 'export const load = () => fetch("/demo/stream", { method: "POST", credentials: "same-origin" });', false],
  ['fixed chat stream transport', 'src/features/conversation-workspace/messaging/chat-stream.ts', 'export const load = () => fetch("/api/chat", { method: "POST", credentials: "same-origin", redirect: "error" });', true],
  ['chat cannot access other endpoints', 'src/features/conversation-workspace/messaging/chat-stream.ts', 'export const load = () => fetch("/api/private", { method: "POST", credentials: "same-origin", redirect: "error" });', false],
  ['chat cannot alias fetch', 'src/features/conversation-workspace/messaging/chat-stream.ts', 'export const load = fetch;', false],
  ['chat cannot follow redirects', 'src/features/conversation-workspace/messaging/chat-stream.ts', 'export const load = () => fetch("/api/chat", { method: "POST", credentials: "same-origin" });', false],
  ['chat cannot override fixed transport options by spreading', 'src/features/conversation-workspace/messaging/chat-stream.ts', 'export const load = (options: RequestInit) => fetch("/api/chat", { method: "POST", credentials: "same-origin", redirect: "error", ...options });', false],
  ['indirect client dependency fetch', 'src/features/shared/load.ts', 'export async function load() { return fetch("https://example.invalid"); }', false],
  ['window fetch alias', 'src/features/check.ts', 'export const load = window.fetch;', false],
  ['computed global fetch', 'src/features/check.ts', 'export const load = globalThis["fetch"];', false],
  ['XHR', 'src/features/check.ts', 'export const xhr = new XMLHttpRequest();', false],
  ['browser stream', 'src/features/check.ts', 'export const stream = new EventSource("/api/private");', false],
  ['browser environment access', 'src/features/check.ts', 'export const key = process.env.AI_API_KEY;', false],
  ['browser environment destructuring', 'src/features/check.ts', 'const { env } = process; export const key = env.AI_API_KEY;', false],
  ['client DB driver', 'src/features/check.ts', 'export { Pool } from "pg";', false],
  ['client provider SDK', 'src/features/check.ts', 'import OpenAI from "openai"; export const api = OpenAI;', false],
  ['server file without marker', 'src/server/check.ts', 'export const key = process.env.AI_API_KEY;', false],
  ['type-only import cannot protect a server module', 'src/server/check.ts', 'import type {} from "server-only"; export const key = process.env.AI_API_KEY;', false],
  ['client directive in server module', 'src/server/check.ts', '"use client"; import "server-only"; export const x = 1;', false],
  ['action without server directive', 'src/app/actions/check.ts', 'import "server-only"; export async function action() { return null; }', false],
  ['action outside designated boundary', 'src/features/check.ts', '"use server"; import "server-only"; export async function action() { return null; }', false],
  ['inline action outside designated boundary', 'src/app/check.ts', 'export async function action() { "use server"; return null; }', false],
  ['action bypassing data access layer', 'src/app/actions/check.ts', '"use server"; import "server-only"; export async function action() { return fetch("https://example.invalid"); }', false],
  ['local file access remains available', 'src/features/check.ts', 'export async function list(handle: FileSystemDirectoryHandle) { return handle.getDirectoryHandle("notes", { create: false }); }', true],
  ['UI displays a supplied DTO', 'src/features/check.tsx', 'export function Label({ title }: { title: string }) { return <span>{title}</span>; }', true],
  ['protected server data access', 'src/server/check.ts', 'import "server-only"; export async function load() { return fetch("https://example.invalid", { headers: { Authorization: process.env.AI_API_KEY ?? "" } }); }', true],
  ['thin action entry point', 'src/app/actions/check.ts', '"use server"; import "server-only"; export async function action() { return { ok: true }; }', true],
];

for (const [name, filePath, code, allowed] of cases) {
  const [result] = await eslint.lintText(code, { filePath });

  assert.equal(result.fatalErrorCount, 0, `${name}: invalid test syntax`);

  const errors = result.messages.filter(message => boundaryRules.has(message.ruleId));

  assert.equal(errors.length === 0, allowed, `${name}: ${JSON.stringify(errors)}`);
}

console.log(`Server boundary: ${cases.length} checks passed (synthetic lint fixtures; no live authentication/DB claims).`);
