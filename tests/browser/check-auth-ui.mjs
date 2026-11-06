import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { Browser, sleep } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const root = process.cwd();
const web = join(root, "apps/web");
const cache = join(web, "node_modules/.cache");
const runtimeURL = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");
assert.equal(runtimeURL.hostname, "127.0.0.1");
assert.equal(runtimeURL.username, "moa_runtime");
assert.equal(runtimeURL.pathname, "/moa_auth_test");
assert.match(process.env.MOA_TEST_DATABASE_RUN ?? "", /^[a-f0-9-]{36}$/);
assert.ok(process.env.MOA_TEST_TLS_CERT?.startsWith(cache));
const requireWeb = createRequire(join(web, "package.json"));
const next = requireWeb.resolve("next/dist/bin/next");
const out = join(root, "docs/verification/auth-access-and-signup/browser");
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });
const app = mkdtempSync(join(cache, "moa-auth-browser-"));
const mails = [];
const checks = [];
let server;
let browser;
let page;
let logs = "";
const runtimeLinks = [];

function copyRuntimeLinks(source, target) {
  if (lstatSync(source).isSymbolicLink()) {
    const destination = realpathSync(source);
    assert.ok(destination.toLowerCase().startsWith((root + sep).toLowerCase()));
    symlinkSync(destination, target, process.platform === "win32" ? "junction" : "dir");
    runtimeLinks.push(target);
  } else if (lstatSync(source).isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source)) copyRuntimeLinks(join(source, name), join(target, name));
  } else cpSync(source, target);
}

const mailServer = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const mail = JSON.parse(raw);
  assert.ok(mail.to.every(address => address.endsWith("@example.invalid")), "Only synthetic mail recipients are permitted");
  mails.push(mail);
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ id: randomUUID() }));
});
await new Promise(accept => mailServer.listen(0, "127.0.0.1", accept));
const mailURL = `http://127.0.0.1:${mailServer.address().port}`;
const portReservation = createServer();
await new Promise(accept => portReservation.listen(0, "127.0.0.1", accept));
const port = portReservation.address().port;
await new Promise(accept => portReservation.close(accept));
const base = `http://127.0.0.1:${port}`;

function check(name, passed) { checks.push({ name, passed }); assert.ok(passed, name); console.log(`PASS UI ${name}`); }
async function wait(predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await page.eval(predicate)) return; await sleep(80); }
  throw new Error("Authentication UI did not reach the expected state");
}
async function input(name, value) {
  await page.eval(name => document.querySelector(`[name="${name}"]`).focus(), name);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send("Input.insertText", { text: value });
}
async function submit() {
  const point = await page.eval(() => {
    const button = document.querySelector('form[data-auth-form] button[type="submit"]');
    button.scrollIntoView({ block: "center" });
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
}
async function link(subject) {
  for (let count = 0; count < 100; count++) {
    const mail = mails.slice().reverse().find(mail => mail.subject.includes(subject));
    if (mail) return mail.text.match(/https?:\/\/\S+/)[0];
    await sleep(50);
  }
  throw new Error("The fixture did not receive an authentication email");
}

try {
  // A copied build and disposable CA keep strict production TLS intact; no app env is copied.
  cpSync(join(web, ".next"), join(app, ".next"), { recursive: true, filter: source => !source.includes(join(".next", "cache")) && !source.includes(join(".next", "node_modules")) });
  copyRuntimeLinks(join(web, ".next/node_modules"), join(app, ".next/node_modules"));
  cpSync(join(web, "public"), join(app, "public"), { recursive: true });
  mkdirSync(join(app, "prisma/certs"), { recursive: true });
  cpSync(process.env.MOA_TEST_TLS_CERT, join(app, "prisma/certs/supabase-prod-ca-2021.crt"));
  writeFileSync(join(app, "package.json"), JSON.stringify({ private: true }));
  const preload = join(app, "fixture-mail.cjs");
  writeFileSync(preload, `const fetchOriginal=globalThis.fetch;globalThis.fetch=(url,options)=>{const target=url instanceof Request?url.url:String(url);if(target!=='https://api.resend.com/emails')return fetchOriginal(url,options);return fetchOriginal(url instanceof Request?new Request(process.env.MOA_MAIL_CAPTURE_URL,url):process.env.MOA_MAIL_CAPTURE_URL,options);};`);
  server = spawn(process.execPath, [next, "start", app, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: app, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: `--require=${JSON.stringify(preload)}`, DATABASE_URL: runtimeURL.toString(), BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: "fixture-browser-" + randomUUID(), RESEND_API_KEY: "fixture-resend-key", EMAIL_FROM: "Moa <sender@example.invalid>", MOA_MAIL_CAPTURE_URL: mailURL, GOOGLE_CLIENT_ID: "fixture-google", GOOGLE_CLIENT_SECRET: "fixture-google-secret", NAVER_CLIENT_ID: "fixture-naver", NAVER_CLIENT_SECRET: "fixture-naver-secret", KAKAO_CLIENT_ID: "fixture-kakao", KAKAO_CLIENT_SECRET: "fixture-kakao-secret" },
  });
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  let ready = false;
  for (let count = 0; count < 100; count++) {
    if (server.exitCode !== null) throw new Error("Fixture Next server exited before readiness");
    try { if ((await fetch(base + "/login")).ok) { ready = true; break; } } catch {}
    await sleep(100);
  }
  assert.ok(ready, "Fixture Next server did not become ready");
  process.env.TASTE_SKILL_TMP = join(root, ".omx/browser-temp");
  mkdirSync(process.env.TASTE_SKILL_TMP, { recursive: true });
  browser = await Browser.launch();
  page = await browser.newPage({ width: 1440, height: 900 });

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    for (const route of ["/login", "/welcome", "/welcome?step=verification", "/forgot-password", "/reset-password", "/verify-email", "/social-signup"]) {
      await page.goto(base + route, { settleMs: 180 });
      check(`${route} fits ${width}px and has one main heading`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll("h1").length === 1));
      await page.screenshot({ path: join(out, `${route.split("?")[0].slice(1)}-${route.includes("?") ? "waiting-" : ""}${width}.png`), format: "png" });
    }
  }

  for (const route of ["/", "/files", "/settings", "/account", "/preview"]) {
    await page.goto(base + route, { settleMs: 180 });
    check(`anonymous ${route} redirects to login`, await page.eval(() => location.pathname === "/login"));
  }
  check("all three official social buttons have loaded images", await page.eval(() => [...document.querySelectorAll('button[name="provider"] img')].length === 3 && [...document.querySelectorAll('button[name="provider"] img')].every(image => image.complete && image.naturalWidth > 0)));

  await page.goto(base + "/welcome?step=complete", { settleMs: 180 });
  check("forged completion URL returns to the name field", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이름") && !document.querySelector('[name="email"]')));
  await input("name", "가상 사용자");
  check("signup IME Enter does not advance", await page.eval(() => !document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })) && !document.querySelector('[name="email"]')));
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait(() => !!document.querySelector('[name="email"]'));
  check("name Enter reveals email below the retained name", await page.eval(() => document.querySelector('[name="name"]').value === "가상 사용자" && !document.querySelector('[name="password"]')));
  await input("email", "browser-flow@example.invalid");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await wait(() => !!document.querySelector('[name="password"]'));
  check("valid email blur reveals password and confirmation on the same form", await page.eval(() => !!document.querySelector('[name="passwordConfirm"]') && document.querySelectorAll('form[data-auth-form]').length === 1));
  await page.eval(() => history.back());
  await wait(() => location.search === "?step=email" && !document.querySelector('[name="password"]'));
  await page.eval(() => history.forward());
  await wait(() => location.search === "?step=password" && !!document.querySelector('[name="password"]'));
  check("browser back and forward restore input progress", true);
  await input("password", "fixture-browser-password");
  await page.send("Page.reload");
  await wait(() => document.querySelector('[name="email"]')?.value === "browser-flow@example.invalid");
  check("reload keeps identity inputs but never passwords", await page.eval(() => document.querySelector('[name="name"]').value === "가상 사용자" && document.querySelector('[name="password"]').value === ""));
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.goto(base + "/welcome", { settleMs: 180 });
  await wait(() => location.search === "?step=password" && !!document.querySelector('[name="password"]'));
  check("a new tab restores only identity and progress", await page.eval(() => document.querySelector('[name="email"]').value === "browser-flow@example.invalid" && document.querySelector('[name="password"]').value === ""));
  await input("password", "fixture-browser-password"); await input("passwordConfirm", "different-fixture-password");
  await submit(); await wait(() => !!document.querySelector('[name="passwordConfirm"][aria-invalid="true"]'));
  check("server password mismatch uses the common form error state", await page.eval(() => document.body.textContent.includes("비밀번호가 일치하지 않습니다")));
  await input("password", "fixture-browser-password"); await input("passwordConfirm", "fixture-browser-password");
  await submit(); await wait(() => location.search.includes("verification"));
  check("successful signup advances the shared Stepper", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일 확인")));
  await page.send("Page.reload"); await wait(() => !!document.querySelector('[aria-current="step"]'));
  check("verification step survives refresh without resubmitting signup", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일 확인")));
  check("mail waiting has a login link and removes the completed input draft", await page.eval(() => !!document.querySelector('nav a[href="/login"]') && !localStorage.getItem("moa-signup-draft-v1")));
  await page.eval(() => { history.back(); });
  await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("이름"));
  check("completed signup does not retain the persistent identity draft", await page.eval(() => document.querySelector('[name="name"]').value === ""));
  await page.eval(() => { history.forward(); });
  await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("이메일 확인"));

  await page.goto(await link("이메일 주소 확인"), { settleMs: 200 });
  check("verification token is removed from the URL", await page.eval(() => !location.search.includes("token=")));
  await submit(); await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("완료"));
  check("verified success reaches completion with a login button", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("완료") && !!document.querySelector('a[href="/login"]')));
  await page.goto(base + "/login", { settleMs: 180 });
  await input("password", "fixture-browser-password"); await submit(); await wait(() => location.pathname === "/");
  check("Server Action forwards the HttpOnly cookie and opens the workspace", await page.eval(() => !document.cookie.includes("session_token")));
  for (const route of ["/login", "/welcome", "/forgot-password", "/reset-password", "/social-signup"]) {
    await page.goto(base + route, { settleMs: 180 });
    check(`authenticated ${route} redirects to workspace`, await page.eval(() => location.pathname === "/"));
  }
  await page.goto(base + "/account", { settleMs: 180 });
  await wait(() => !!document.querySelector('form[data-auth-form] button[type="submit"]'));
  check("account refresh revalidates the cookie on the server", await page.eval(() => document.body.textContent.includes("browser-flow@example.invalid")));
  check("authentication inputs never persist secret tokens or passwords", await page.eval(() => !Object.values(sessionStorage).join(" ").match(/fixture-browser-password|session_token|"token"/)));
  await submit(); await wait(() => location.pathname === "/login");
  await page.goto(base + "/account", { settleMs: 180 });
  check("logout removes the cookie and the server blocks account re-entry", await page.eval(() => location.pathname === "/login"));

  await page.goto(base + "/forgot-password", { settleMs: 180 });
  await input("email", "browser-flow@example.invalid");
  await submit(); await wait(() => document.body.textContent.includes("해당 이메일로 가입한 계정이 있다면"));
  await page.goto(await link("비밀번호 재설정"), { settleMs: 200 });
  check("reset callback arrives with an in-memory token and a clean URL", await page.eval(() => location.pathname === "/reset-password" && !location.search.includes("token=") && !!document.querySelector('[name="token"]')?.value));
  await input("password", "new-fixture-browser-password"); await input("passwordConfirm", "new-fixture-browser-password");
  await submit(); await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("완료"));
  check("reset uses the same common Stepper and completes after server validation", await page.eval(() => !document.querySelector('[name="token"]') && document.body.textContent.includes("비밀번호를 변경했습니다")));
  await page.goto(base + "/login", { settleMs: 180 });
  await input("email", "browser-flow@example.invalid");
  await input("password", "fixture-browser-password"); await submit(); await wait(() => !!document.querySelector('[role="alert"]'));
  check("the old password is rejected", await page.eval(() => location.pathname === "/login"));
  await input("password", "new-fixture-browser-password"); await submit(); await wait(() => location.pathname === "/");
  check("the new password signs in through the real Server Action", true);

  await page.goto(base + "/account", { settleMs: 180 });
  await wait(() => !!document.querySelector('form[data-auth-form] button[type="submit"]'));
  await submit(); await wait(() => location.pathname === "/login");

  await page.goto(base + "/login", { settleMs: 180 });
  await page.eval(() => { document.querySelector('[name="email"]').focus(); });
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  check("keyboard Tab follows labeled form fields", await page.eval(() => document.activeElement.name === "password"));
  check("IME Enter is prevented while composing", await page.eval(() => !document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))));
  await page.eval(() => { Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("fixture storage blocked", "SecurityError"); } }); });
  await input("email", "blocked-store@example.invalid");
  check("blocked storage does not prevent typing", await page.eval(() => document.querySelector('[name="email"]').value === "blocked-store@example.invalid"));
  check("no browser runtime errors", page.consoleErrors.length === 0);
  writeFileSync(join(out, "checks.json"), JSON.stringify({ at: new Date().toISOString(), buildId: readFileSync(join(app, ".next/BUILD_ID"), "utf8").trim(), fixture: "disposable PostgreSQL with strict TLS; private Next build copy; synthetic Resend capture; isolated Chromium", checks }, null, 2));
  console.log(`Authentication UI: ${checks.length} browser checks passed.`);
} catch (error) {
  writeFileSync(join(out, "checks.json"), JSON.stringify({ checks, failed: true }, null, 2));
  console.error(logs.slice(-6000));
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { server.kill(); await new Promise(accept => server.once("exit", accept)); }
  await new Promise(accept => mailServer.close(accept));
  assert.ok(resolve(app).startsWith(resolve(cache) + sep) && app.includes("moa-auth-browser-"));
  for (const link of runtimeLinks) {
    assert.ok(resolve(link).startsWith(resolve(app) + sep));
    unlinkSync(link);
  }
  rmSync(app, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
