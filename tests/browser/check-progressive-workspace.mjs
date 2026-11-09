import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const output = resolve(process.argv[2] ?? "docs/verification/progressive-chat/loading");
const root = resolve(".omx/progressive-workspace", new Date().toISOString().replace(/[:.]/g, "-"));
const app = join(root, "app");
mkdirSync(join(app, "(workspace)/settings"), { recursive: true });
mkdirSync(join(app, "login"), { recursive: true });
mkdirSync(output, { recursive: true });
symlinkSync(resolve("apps/web/node_modules"), join(root, "node_modules"), "junction");
const next = createRequire(resolve("apps/web/package.json")).resolve("next/dist/bin/next");
const env = Object.fromEntries(["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" });
const sourceImport = (file, target) => {
  const path = relative(dirname(join(root, file)), resolve(target)).replaceAll("\\", "/").replace(/\.tsx?$/, "");
  return JSON.stringify(path.startsWith(".") ? path : "./" + path);
};
const write = (file, text) => writeFileSync(join(root, file), text);
write("package.json", '{"private":true}');
write("tsconfig.json", JSON.stringify({ extends: relative(root, resolve("tsconfig.base.json")).replaceAll("\\", "/"), compilerOptions: { jsx: "react-jsx", incremental: false, lib: ["DOM", "DOM.Iterable", "DOM.AsyncIterable", "ES2022"] }, include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }));
write("next.config.mjs", `export default { turbopack: { root: ${JSON.stringify(resolve("."))} }, transpilePackages: ["@personal-ai/domain"] };`);
write("app/layout.tsx", `export { default } from ${sourceImport("app/layout.tsx", "apps/web/src/app/layout.tsx")};`);
write("app/login/page.tsx", 'export default function Page() { return <main data-denied>로그인이 필요합니다.</main>; }');
write("app/(workspace)/page.tsx", 'export default function Page() { return <main data-private><h1>합성 작업 내용</h1><textarea aria-label="합성 입력" /></main>; }');
write("guards.ts", `import { headers } from "next/headers"; import { redirect } from "next/navigation";
export async function requireWorkspace() { const h = await headers(); await new Promise(r => setTimeout(r, 1500)); if(h.get("cookie")?.includes("fixture-denied=1")) redirect("/login"); return { userId:"fixture-owner", workspaceId:"fixture-space", sessionUserId:"fixture-login", sessionExpiresAt:new Date(Date.now()+60000).toISOString() }; }
export async function requireAccountSession() { return { user: { id: "fixture-login" } }; }`);
write("settings.ts", `import type { AccountLoginSettings, WorkspaceConnection } from ${sourceImport("settings.ts", "apps/web/src/shared/auth-contract.ts")};
export async function prepareSettingsDisplay(_headers: Headers) {}
export async function readSettingsDisplay(_headers: Headers): Promise<{account:AccountLoginSettings, connection:WorkspaceConnection|null}> { await new Promise(r=>setTimeout(r,3500)); return {account:{name:"합성 사용자", email:"fixture@example.invalid", hasPassword:true, providers:[]}, connection:null}; }`);
write("actions.ts", `"use server";
export async function checkAuthSessionAction() { return { available: true, session: {user:{id:"fixture-login", emailVerified:true}, session:{userId:"fixture-login", expiresAt:new Date(Date.now()+60000).toISOString()}} }; }
${["socialAccountAction", "connectExistingAccountAction", "selectConnectedWorkspaceAction", "disconnectAccountConnectionAction"].map(name => `export async function ${name}(): Promise<never> { throw new Error("Fixture mutations forbidden"); }`).join("\n")}`);
for (const [source, destination] of [["apps/web/src/app/(workspace)/layout.tsx", "app/(workspace)/layout.tsx"], ["apps/web/src/app/(workspace)/settings/page.tsx", "app/(workspace)/settings/page.tsx"]]) {
  write(destination, readFileSync(source, "utf8").replace(/from "(\.[^"]+)"/gu, (_match, specifier) => {
    const actual = resolve(dirname(resolve(source)), specifier).replaceAll("\\", "/");
    const fixture = actual.endsWith("/server/session-guards") ? "guards.ts" : actual.endsWith("/server/settings-display") ? "settings.ts" : actual.endsWith("/app/actions/auth") ? "actions.ts" : null;
    return "from " + sourceImport(destination, fixture ? join(root, fixture) : actual);
  }));
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, server;
const checks = [], samples = [];
const check = (name, passed) => { checks.push({ name, passed: !!passed }); assert.ok(passed, name); };
async function until(page, predicate) { for(let n=0;n<250;n++){if(await page.eval(`Boolean((${predicate.toString()})())`))return;await pause(30);}throw Error("Progressive workspace fixture timeout"); }
try {
  await new Promise((done, fail) => {
    const build = spawn(process.execPath, [next, "build"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let log = ""; build.stdout.on("data", data => { log += data; }); build.stderr.on("data", data => { log += data; });
    build.on("error", fail); build.on("exit", code => { write("build.log", log); code === 0 ? done() : fail(Error(log.slice(-3500))); });
  });
  server = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "3036"], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let serverLog = ""; server.stdout.on("data", data => { serverLog += data; }); server.stderr.on("data", data => { serverLog += data; });
  for(let n=0;!serverLog.includes("Ready in");n++){assert.ok(n<200 && server.exitCode===null);await pause(30);}
  browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });
  for (const width of [390, 1440, 1920]) {
    const page = await browser.newPage({ width, height: 1000 });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.progressive = {shell:null,content:null}; new MutationObserver(()=>{if(document.querySelector('[data-workspace-sidebar]')?.checkVisibility() && progressive.shell===null)progressive.shell=performance.now();if(document.querySelector('[data-private]')?.checkVisibility() && progressive.content===null)progressive.content=performance.now();}).observe(document,{childList:true,subtree:true,attributes:true});` });
    await page.send("Page.navigate", { url: "http://127.0.0.1:3036/" });
    await until(page, () => document.querySelector('[data-workspace-sidebar]')?.checkVisibility());
    check(`${width}: public shell precedes protected content and exposes no input`, await page.eval(() => !document.querySelector('[data-private]') && !document.querySelector("textarea")));
    check(`${width}: pending shell fits viewport without full loading cover`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && !document.querySelector('[data-navigation-loading]')));
    await page.screenshot({ path: `${output}/shell-${width}.png`, format: "png" });
    await until(page, () => document.querySelector('[data-private]')?.checkVisibility());
    const timing = await page.eval(() => window.progressive); samples.push({ width, ...timing });
    check(`${width}: auth settles before private content is shown`, timing.content - timing.shell > 500);
    check(`${width}: no browser exceptions`, page.consoleErrors.length === 0);
    await page.close();
  }
  const settings = await browser.newPage({ width: 1440, height: 1000 });
  await settings.send("Page.navigate", { url: "http://127.0.0.1:3036/settings?tab=controls" });
  await until(settings, () => document.querySelector('[aria-label="빠른 전환 단축키"]')?.checkVisibility());
  check("settings controls are usable while account data is still pending", await settings.eval(() => !document.querySelector('[aria-label="계정과 로그인 수단"]') && !!document.querySelector('[aria-label="설정 분류"]')));
  await settings.eval(() => document.querySelector('[aria-label="설정 분류"] a[href$="tab=folders"]').click());
  await until(settings, () => document.querySelector('[aria-label="자료 폴더와 복구 보관함"]')?.checkVisibility());
  check("local settings tab switches before account cache miss finishes", await settings.eval(() => !document.querySelector('[aria-label="계정과 로그인 수단"]')));
  await until(settings, () => document.querySelector('[aria-label="계정과 로그인 수단"]'));
  check("account panel fills later without resetting the selected tab", await settings.eval(() => new URL(location.href).searchParams.get("tab") === "folders"));
  const denied = await browser.newPage({ width: 1440, height: 1000 });
  await denied.send("Network.setCookie", { name: "fixture-denied", value: "1", url: "http://127.0.0.1:3036" });
  await denied.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.leaked=false; new MutationObserver(()=>{if(document.querySelector('[data-private]'))window.leaked=true;}).observe(document,{childList:true,subtree:true});` });
  await denied.send("Page.navigate", { url: "http://127.0.0.1:3036/" });
  await until(denied, () => document.querySelector('[data-denied]'));
  check("denied guard redirects without exposing protected content", await denied.eval(() => !window.leaked && !document.querySelector('[data-private]')));
  check("settings and denial have no browser exceptions", settings.consoleErrors.length === 0 && denied.consoleErrors.length === 0);
  writeFileSync(`${output}/checks.json`, JSON.stringify({ checks, samples, condition: "Actual product workspace layout, settings page and shared UI in isolated Next production fixture; server auth/owner/session/settings replaced with delayed synthetic values; no actual account/model/DB claims", buildId: readFileSync(join(root,".next/BUILD_ID"),"utf8").trim() }, null, 2));
  console.log(`${checks.length} progressive workspace checks passed.`);
} finally { if(browser)await browser.close(); server?.kill(); }
