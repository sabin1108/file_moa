import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve, sep } from "node:path";
import { Browser, sleep } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { probe, layout, app as appProbe } from "../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs";
import { judge, judgeLayout, judgeApp, APP_SKIP } from "../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs";

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
const { Pool } = requireWeb("pg");
const fixtureSecret = "fixture-browser-" + randomUUID();
const fixtureDatabase = new Pool({ connectionString: runtimeURL.toString(), ssl: { ca: readFileSync(process.env.MOA_TEST_TLS_CERT, "utf8"), rejectUnauthorized: true }, max: 1 });
const next = requireWeb.resolve("next/dist/bin/next");
const out = join(root, "docs/verification/kakao-disabled/browser");
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });
const app = mkdtempSync(join(cache, "moa-auth-browser-"));
const mails = [];
const checks = [];
const designChecks = [];
const canvasChecks = [];
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
async function wait(predicate, timeout = 15_000, argument) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await page.eval(predicate, argument)) return; await sleep(80); }
  throw new Error("Authentication UI did not reach the expected state");
}
async function input(name, value) {
  await wait(name => {
    const field = document.querySelector(`[name="${name}"]`);
    return field && field.getBoundingClientRect().width > 0 && !field.disabled && !field.closest('[inert], [hidden]') && !document.querySelector('[role="status"][aria-busy="true"]');
  }, 15_000, name);
  await page.eval(name => document.querySelector(`[name="${name}"]`).focus(), name);
  await wait(name => document.activeElement === document.querySelector(`[name="${name}"]`), 15_000, name);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
  await page.send("Input.insertText", { text: value });
  assert.ok(await page.eval(({ name, value }) => document.querySelector(`[name="${name}"]`).value === value, { name, value }), "Fixture typing must reach the visible field");
}
async function submit(selector = 'form[data-auth-form]') {
  await wait(selector => {
    const button = document.querySelector(selector + ' button[type="submit"]');
    return button && !button.disabled && button.getBoundingClientRect().width > 0 && !document.querySelector('[role="status"][aria-busy="true"]');
  }, 15_000, selector);
  await page.eval(selector => document.querySelector(selector + ' button[type="submit"]').scrollIntoView({ block: "center", behavior: "instant" }), selector);
  await page.eval(() => new Promise(requestAnimationFrame));
  const point = await page.eval(selector => {
    const button = document.querySelector(selector + ' button[type="submit"]');
    const rect = button.getBoundingClientRect();
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    return { x, y, hit: button.contains(document.elementFromPoint(x, y)) };
  }, selector);
  assert.ok(point.hit, `Submit button must be visible and reachable: ${selector} (${point.x},${point.y})`);
  for (const type of ["mousePressed", "mouseReleased"]) await page.send("Input.dispatchMouseEvent", { type, x: point.x, y: point.y, button: "left", clickCount: 1 });
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
    env: { ...process.env, NODE_ENV: "production", NODE_OPTIONS: `--require=${JSON.stringify(preload)}`, DATABASE_URL: runtimeURL.toString(), BETTER_AUTH_URL: base, BETTER_AUTH_SECRET: fixtureSecret, RESEND_API_KEY: "fixture-resend-key", EMAIL_FROM: "Moa <sender@example.invalid>", MOA_MAIL_CAPTURE_URL: mailURL, GOOGLE_CLIENT_ID: "fixture-google", GOOGLE_CLIENT_SECRET: "fixture-google-secret", NAVER_CLIENT_ID: "fixture-naver", NAVER_CLIENT_SECRET: "fixture-naver-secret", KAKAO_CLIENT_ID: "fixture-kakao", KAKAO_CLIENT_SECRET: "fixture-kakao-secret" },
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
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.moaCanvasSamples = [];
    function sampleCanvas() {
      if (!document.documentElement) return;
      const root = getComputedStyle(document.documentElement);
      const body = document.body && getComputedStyle(document.body);
      window.moaCanvasSamples.push({ root: root.backgroundColor, body: body?.backgroundColor, scheme: root.colorScheme });
    }
    document.addEventListener("readystatechange", sampleCanvas);
    let count = 0;
    function sampleFrame() { sampleCanvas(); if (++count < 12) requestAnimationFrame(sampleFrame); }
    requestAnimationFrame(sampleFrame);
  ` });

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    for (const route of ["/login", "/welcome", "/welcome?step=email", "/welcome?step=verification", "/forgot-password", "/reset-password", "/verify-email", "/social-signup"]) {
      await page.goto(base + route, { settleMs: 180 });
      const canvas = await page.eval(() => ({ samples: window.moaCanvasSamples, root: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
      canvasChecks.push({ route, width, ...canvas });
      check(`${route} paints a light document canvas at ${width}px`, canvas.root === "rgb(228, 232, 230)" && canvas.body === "rgb(228, 232, 230)" && canvas.samples.length > 0 && canvas.samples.every(sample => sample.root === "rgb(228, 232, 230)" && sample.scheme === "light"));
      check(`${route} fits ${width}px and has one main heading`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll("h1").length === 1));
      await page.screenshot({ path: join(out, `${route.split("?")[0].slice(1)}-${new URL(route, base).searchParams.get("step") ?? "entry"}-${width}.png`), format: "png" });
    }
  }

  for (const route of ["/", "/files", "/settings", "/account", "/preview"]) {
    await page.goto(base + route, { settleMs: 180 });
    check(`anonymous ${route} redirects to login`, await page.eval(() => location.pathname === "/login"));
  }
  check("Kakao is absent from login despite stored fixture credentials", await page.eval(() => !document.querySelector('button[name="provider"][value="kakao"]')));
  check("both enabled official social buttons have loaded images", await page.eval(() => [...document.querySelectorAll('button[name="provider"] img')].length === 2 && [...document.querySelectorAll('button[name="provider"] img')].every(image => image.complete && image.naturalWidth > 0)));
  check("social methods occupy two full-width rows before email login", await page.eval(() => {
    const buttons = [...document.querySelectorAll('button[name="provider"]')].map(button => button.getBoundingClientRect());
    return buttons.every((rect, index) => rect.height >= 44 && rect.width >= 260 && (!index || rect.top >= buttons[index - 1].bottom))
      && buttons[1].bottom < document.querySelector('form[data-auth-form]').getBoundingClientRect().top;
  }));
  check("guest home links point directly to login rather than a protected-home redirect", await page.eval(() => [...document.querySelectorAll('header a')].every(link => link.getAttribute("href") === "/login")));
  const navigationResponses = [];
  await page.send("Network.enable");
  const stopNavigation = page.browser.on(page.sessionId, "Fetch.requestPaused", event => navigationResponses.push(event));
  await page.send("Fetch.enable", { patterns: [{ urlPattern: base + "/welcome*", resourceType: "Fetch", requestStage: "Response" }] });
  await page.goto(base + "/login", { settleMs: 220 });
  await wait(() => !!document.querySelector('a[href="/welcome"]'));
  const navigationPoint = await page.eval(() => { const rect = document.querySelector('a[href="/welcome"]').getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...navigationPoint });
  await page.eval(() => { window.fixtureLoginForm = document.querySelector('form[data-auth-form]'); document.querySelector('a[href="/welcome"]').click(); });
  for (let count = 0; count < 100 && !navigationResponses.length; count++) await sleep(30);
  await wait(() => document.body.textContent.includes("페이지를 이동하고 있어요."));
  check("a held page navigation shows the shared loading feedback", navigationResponses.length > 0);
  check("pending navigation keeps the previous form visible", await page.eval(() => window.fixtureLoginForm === document.querySelector('form[data-auth-form]') && window.fixtureLoginForm.getBoundingClientRect().width > 0));
  check("navigation feedback stays at the viewport top while the link is hovered", await page.eval(() => { const rect = document.querySelector('[role="status"][aria-busy="true"]').getBoundingClientRect(); return rect.top <= 24 && Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 2; }));
  for (const event of navigationResponses) await page.send("Fetch.continueResponse", { requestId: event.requestId });
  await page.send("Fetch.disable"); stopNavigation();
  await wait(() => location.pathname === "/welcome");
  await page.goto(base + "/welcome", { settleMs: 180 });
  check("signup first offers social methods or a separate email form", await page.eval(() => document.querySelectorAll('button[name="provider"]').length === 2 && !!document.querySelector('a[href="/welcome?step=email"]') && !document.querySelector('[name="name"]')));
  await page.eval(() => document.querySelector('a[href="/welcome?step=email"]').click());
  await wait(() => !!document.querySelector('[name="email"]'));
  check("signup no longer collects a display name", await page.eval(() => !document.querySelector('[name="name"]')));
  check("email choice opens the reusable progressive Stepper without duplicate social rows", await page.eval(() => !!document.querySelector('[aria-current="step"]') && !document.querySelector('button[name="provider"]')));

  await page.goto(base + "/welcome?step=complete", { settleMs: 180 });
  const signupTop = await page.eval(() => document.querySelector("h1").getBoundingClientRect().top);
  check("forged completion URL returns to email", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일") && !document.querySelector('[name="password"]')));
  await input("email", "browser-flow@example.invalid");
  check("signup IME Enter does not advance", await page.eval(() => !document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })) && !document.querySelector('[name="password"]')));
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await wait(() => !!document.querySelector('[name="passwordConfirm"]') && document.activeElement?.getAttribute("name") === "password");
  check("email Tab enters the newly revealed password on the same form", await page.eval(() => !!document.querySelector('[name="passwordConfirm"]') && document.activeElement?.getAttribute("name") === "password" && document.querySelectorAll('form[data-auth-form]').length === 1));
  await page.eval(() => new Promise(resolve => setTimeout(resolve, 260)));
  check("revealing password fields keeps the heading anchored", Math.abs(await page.eval(() => document.querySelector("h1").getBoundingClientRect().top) - signupTop) < 1);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  check("reduced motion disables input reveal", await page.eval(() => getComputedStyle(document.querySelector('[name="password"]').closest('[class*="revealedField"]')).animationName === "none"));
  await page.send("Emulation.setEmulatedMedia", { features: [] });

  await page.eval(() => history.back());
  await wait(() => location.search === "?step=email" && !document.querySelector('[name="password"]'));
  await page.eval(() => history.forward());
  await wait(() => location.search === "?step=password" && !!document.querySelector('[name="password"]'));
  check("browser back and forward restore input progress", true);
  await input("password", "fixture-browser-password");
  await page.eval(() => document.querySelector('[aria-controls="auth-password"]').click());
  check("password visibility preserves the value without submitting", await page.eval(() => document.querySelector('[name="password"]').type === "text" && document.querySelector('[name="password"]').value === "fixture-browser-password" && document.querySelector('[aria-controls="auth-password"]').getAttribute("aria-pressed") === "true"));
  await page.eval(() => document.querySelector('[aria-controls="auth-password"]').click());
  check("password visibility can be concealed again", await page.eval(() => document.querySelector('[name="password"]').type === "password"));
  await page.send("Page.reload");
  await wait(() => document.querySelector('[name="email"]')?.value === "browser-flow@example.invalid");
  check("reload keeps identity inputs but never passwords", await page.eval(() => !document.querySelector('[name="name"]') && document.querySelector('[name="password"]').value === ""));
  const previousPage = page;
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.goto(base + "/welcome", { settleMs: 180 });
  await page.eval(() => document.querySelector('a[href="/welcome?step=password"]').click());
  await wait(() => location.search === "?step=password" && !!document.querySelector('[name="password"]'));
  check("a new tab restores only identity and progress", await page.eval(() => document.querySelector('[name="email"]').value === "browser-flow@example.invalid" && document.querySelector('[name="password"]').value === ""));
  await previousPage.close();
  await input("password", "fixture-browser-password"); await input("passwordConfirm", "different-fixture-password");
  await submit(); await wait(() => !!document.querySelector('[name="passwordConfirm"][aria-invalid="true"]'));
  check("server password mismatch uses the common form error state", await page.eval(() => document.body.textContent.includes("비밀번호가 일치하지 않습니다")));
  await input("password", "fixture-browser-password"); await input("passwordConfirm", "fixture-browser-password");
  await submit(); await wait(() => location.search.includes("verification"));
  check("successful signup advances the shared Stepper", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일 확인")));
  await page.send("Page.reload"); await wait(() => !!document.querySelector('[aria-current="step"]'));
  check("verification step survives refresh without resubmitting signup", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일 확인")));
  check("mail waiting has a login link and removes the completed input draft", await page.eval(() => !!document.querySelector('nav a[href="/login"]') && !localStorage.getItem("moa-signup-draft-v1")));
  check("verification waiting never links back to signup input", await page.eval(() => ![...document.querySelectorAll('a')].some(link => link.getAttribute("href") === "/welcome")));
  await page.eval(() => { history.back(); });
  await wait(() => document.querySelector('h1')?.textContent === "모아 계정 만들기" && location.search === "?step=email" && document.querySelector('[name="email"]')?.value === "");
  check("completed signup does not retain the persistent identity draft", await page.eval(() => document.querySelector('[name="email"]').value === ""));
  await page.eval(() => { history.forward(); });
  await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("이메일 확인"));

  await page.goto(await link("이메일 주소 확인"), { settleMs: 200 });
  check("verification token is removed from the URL", await page.eval(() => !location.search.includes("token=")));
  await submit(); await wait(() => document.querySelector('[aria-current="step"]')?.textContent.includes("완료"));
  check("verified success reaches completion with a login button", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("완료") && !!document.querySelector('a[href="/login"]')));
  await page.goto(base + "/login", { settleMs: 180 });
  await input("password", "fixture-browser-password"); await submit(); await wait(() => location.pathname === "/account" && !!document.querySelector('[name="name"]'));
  check("verified signup asks only for a display name after first login", await page.eval(() => document.querySelectorAll('form[data-auth-form] input').length === 1 && !document.querySelector('[name="password"]')));
  await page.screenshot({ path: join(out, "profile-name-1440.png"), fullPage: true });
  await page.goto(base + "/files", { settleMs: 180 });
  check("unfinished name setup cannot bypass into a workspace", await page.eval(() => location.pathname === "/account" && !!document.querySelector('[name="name"]')));
  await input("name", "   ");
  await submit(); await wait(() => !!document.querySelector('[name="name"][aria-invalid="true"]'));
  check("invalid profile input stays editable without losing the typed value", await page.eval(() => document.querySelector('[name="name"]').value === "   " && location.pathname === "/account"));
  await input("name", "가상 사용자");
  check("name setup IME Enter does not submit", await page.eval(() => !document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }))));
  await submit(); await wait(() => location.pathname === "/");
  check("profile name is stored on the authenticated user", (await fixtureDatabase.query('SELECT name FROM moa_auth."user" WHERE email=$1', ["browser-flow@example.invalid"])).rows[0].name === "가상 사용자");
  check("Server Action forwards the HttpOnly cookie and opens the workspace", await page.eval(() => !document.cookie.includes("session_token")));
  for (const route of ["/login", "/welcome", "/forgot-password", "/reset-password", "/social-signup"]) {
    await page.goto(base + route, { settleMs: 180 });
    check(`authenticated ${route} redirects to workspace`, await page.eval(() => location.pathname === "/"));
  }
  await page.goto(base + "/account", { settleMs: 180 });
  check("saved name does not prompt again", await page.eval(() => !document.querySelector('[name="name"]') && document.body.textContent.includes("가상 사용자")));
  await wait(() => !!document.querySelector('form[data-auth-form] button[type="submit"]'));
  check("account refresh revalidates the cookie on the server", await page.eval(() => document.body.textContent.includes("browser-flow@example.invalid")));
  await sleep(500);
  const held = [];
  const focusRequests = new Set();
  await page.send("Network.enable");
  const stopNetwork = page.browser.on(page.sessionId, "Network.requestWillBeSent", event => { if (event.request.url === base + "/account" && event.request.method === "POST") focusRequests.add(event.requestId); });
  const stopPaused = page.browser.on(page.sessionId, "Fetch.requestPaused", event => { held.push(event); });
  await page.send("Fetch.enable", { patterns: [{ urlPattern: base + "/account", resourceType: "Fetch", requestStage: "Response" }] });
  await page.eval(() => {
    window.fixtureAccountForm = document.querySelector('form[data-auth-form]');
    for (let index = 0; index < 8; index++) { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); }
  });
  for (let count = 0; count < 100 && !held.length; count++) await sleep(30);
  check("focus and visibility bursts share one in-flight session check", held.length === 1 && focusRequests.size === 1);
  check("pending background revalidation never hides or remounts the authenticated form", await page.eval(() => !document.body.textContent.includes("로그인 상태를 확인하고 있어요") && window.fixtureAccountForm === document.querySelector('form[data-auth-form]') && !document.querySelector('[inert]')));
  for (const event of held) await page.send("Fetch.continueResponse", { requestId: event.requestId });
  await page.send("Fetch.disable"); stopNetwork(); stopPaused();
  const blocked = [];
  const stopBlocked = page.browser.on(page.sessionId, "Fetch.requestPaused", event => blocked.push(event));
  await page.send("Fetch.enable", { patterns: [{ urlPattern: base + "/account", resourceType: "Fetch", requestStage: "Response" }] });
  await page.eval(() => window.dispatchEvent(new Event("moa-auth-session-changed")));
  for (let count = 0; count < 100 && !blocked.length; count++) await sleep(30);
  check("blocking session changes show the shared loader instead of an empty screen", await page.eval(() => !!document.querySelector('[role="status"][aria-busy="true"]') && document.body.textContent.includes("로그인 상태를 확인하고 있어요.")));
  check("blocking loader and uncovered document canvas remain light", await page.eval(() => getComputedStyle(document.documentElement).backgroundColor === "rgb(228, 232, 230)" && getComputedStyle(document.body).backgroundColor === "rgb(228, 232, 230)" && getComputedStyle(document.querySelector('[role="status"][aria-busy="true"]')).backgroundColor === "rgb(228, 232, 230)"));
  for (const event of blocked) await page.send("Fetch.continueResponse", { requestId: event.requestId });
  await page.send("Fetch.disable"); stopBlocked();
  await wait(() => !!document.querySelector('form[data-auth-form]'));

  for (const width of [390, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    for (const tab of ["account", "folders", "editor"]) {
      await page.goto(base + "/settings?tab=" + tab, { settleMs: 220 });
      await wait(() => !!document.querySelector('[class*="settingsPanel"]') && document.querySelector("h1")?.getBoundingClientRect().width > 0);
      await page.eval(async () => { await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
      check(`settings ${tab} fits ${width}px`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll("h1").length === 1));
      check(`settings ${tab} has real account entry and no obsolete login notice`, await page.eval(() => !!document.querySelector('a[href="/account"]') && !document.body.textContent.includes("실제 로그인은 아직 연결되지 않았습니다")));
      if (tab === "account") check("social account settings show two enabled provider actions", await page.eval(() => document.querySelectorAll('[aria-label="소셜 로그인 연결 관리"] button').length === 2));
      const metrics = await page.eval(probe);
      const arrangement = await page.eval(layout);
      const appMetrics = await page.eval(appProbe);
      const findings = [...judge(metrics, { width }), ...judgeLayout(arrangement, { width })].filter(finding => !APP_SKIP.has(finding.id) && finding.id !== "no-title" && finding.id !== "small-title").concat(judgeApp(appMetrics, metrics, { width }));
      designChecks.push({ tab, width, findings });
      if (findings.some(finding => finding.level === "FAIL")) {
        writeFileSync(join(out, "design-checks.json"), JSON.stringify({ checks: designChecks }, null, 2));
        await page.screenshot({ path: join(out, `settings-failed-${tab}-${width}.png`), format: "png" });
        console.log(JSON.stringify(findings.filter(finding => finding.level === "FAIL")));
      }
      check(`taste app inspection ${tab} at ${width}px has no failure`, !findings.some(finding => finding.level === "FAIL"));
      await page.screenshot({ path: join(out, `settings-${tab}-${width}.png`), format: "png" });
    }
  }
  await page.goto(base + "/settings?tab=account", { settleMs: 220 });
  await page.eval(async () => {
    window.fixtureSettingsIndicator = document.querySelector('[class*="settingsIndicator"]');
    document.querySelector('[aria-label="설정 분류"] a[href="/settings?tab=editor"]').click();
    for (let frame = 0; frame < 60; frame++) {
      await new Promise(requestAnimationFrame);
      window.fixtureSettingsMotion = { x: new DOMMatrixReadOnly(getComputedStyle(window.fixtureSettingsIndicator).transform).m41, end: window.fixtureSettingsIndicator.getBoundingClientRect().width * 2 };
      if (window.fixtureSettingsMotion.x > 0 && window.fixtureSettingsMotion.x < window.fixtureSettingsMotion.end) break;
    }
  });
  await wait(() => location.search === "?tab=editor");
  check("settings switches retain one indicator with a real transform transition", await page.eval(() => window.fixtureSettingsIndicator === document.querySelector('[class*="settingsIndicator"]') && parseFloat(getComputedStyle(window.fixtureSettingsIndicator).transitionDuration) > 0 && !!document.querySelector('[aria-current="page"][href="/settings?tab=editor"]')));
  check("the settings underline passes through an intermediate position", await page.eval(() => window.fixtureSettingsMotion.x > 0 && window.fixtureSettingsMotion.x < window.fixtureSettingsMotion.end));
  await page.eval(() => history.back());
  await wait(() => location.search === "?tab=account");
  check("settings browser history restores the active navigation", await page.eval(() => !!document.querySelector('[aria-label="설정 분류"] [aria-current="page"][href="/settings?tab=account"]')));
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  check("settings respects reduced motion", await page.eval(() => getComputedStyle(document.querySelector('[class*="settingsIndicator"]')).transitionDuration === "0s" && getComputedStyle(document.querySelector('[class*="settingsSection"]')).animationName === "none"));
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await page.goto(base + "/settings?tab=folders", { settleMs: 220 });
  await page.eval(async () => { const root = await navigator.storage.getDirectory(); const folder = await root.getDirectoryHandle("fixture-notes", { create: true }); window.showDirectoryPicker = async () => folder; });
  await page.eval(() => { [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "폴더 연결").click(); });
  await wait(() => document.body.textContent.includes("fixture-notes"));
  check("the shared folder settings still connect a synthetic local folder", await page.eval(() => !![...document.querySelectorAll("button")].find(button => button.textContent.trim() === "다른 폴더 선택")));
  await page.screenshot({ path: join(out, "settings-folders-connected-1920.png"), format: "png" });
  writeFileSync(join(out, "design-checks.json"), JSON.stringify({ tool: "design-taste-frontend app probe/rules in the authenticated fixture", checks: designChecks }, null, 2));

  await page.send("Network.enable");
  await page.send("Network.setCacheDisabled", { cacheDisabled: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.moaLab={lcp:null,cls:0};new PerformanceObserver(list=>{for(const e of list.getEntries())window.moaLab.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.moaLab.cls+=e.value;}).observe({type:'layout-shift',buffered:true});` });
  const performanceSamples = [];
  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    for (const route of ["/", "/files", "/settings?tab=account", "/settings?tab=folders", "/settings?tab=editor", "/account"]) {
      for (let run = 1; run <= 3; run++) {
        await page.goto(base + route, { settleMs: 350 });
        const sample = await page.eval(() => {
          const navigation = performance.getEntriesByType("navigation")[0];
          const resources = [...performance.getEntriesByType("navigation"), ...performance.getEntriesByType("resource")];
          return { ...window.moaLab, loadMs: navigation.loadEventEnd, transferBytes: resources.reduce((sum, entry) => sum + entry.transferSize, 0), requests: resources.length, observedPath: location.pathname, checkingVisible: document.body.textContent.includes("로그인 상태를 확인하고 있어요") };
        });
        performanceSamples.push({ width, route, run, ...sample });
      }
    }
  }
  writeFileSync(join(out, "performance-authenticated.json"), JSON.stringify({ at: new Date().toISOString(), buildId: readFileSync(join(app, ".next/BUILD_ID"), "utf8").trim(), conditions: "Windows isolated Chromium; production build; disposable local SQL with verified TLS; authenticated synthetic account and empty OPFS folder; HTTP cache disabled; 350ms post-load observation; no CPU/network throttling; three samples per route and width; lab LCP/CLS, no field INP or real-disk claim", samples: performanceSamples }, null, 2));
  check("36 authenticated route samples show the requested workspace and no blocking session notice", performanceSamples.length === 36 && performanceSamples.every(sample => !sample.checkingVisible && sample.observedPath === new URL(sample.route, base).pathname));
  await page.goto(base + "/account", { settleMs: 180 });
  await wait(() => !!document.querySelector('form[data-auth-form] button[type="submit"]'));
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

  const socialUserId = "browser-social-" + randomUUID();
  const socialToken = randomUUID();
  await fixtureDatabase.query('INSERT INTO moa_auth."user" (id,name,email,"emailVerified","updatedAt") VALUES ($1,$2,$3,false,now())', [socialUserId, "소셜 사용자", "browser-social@example.invalid"]);
  await fixtureDatabase.query('INSERT INTO moa_auth.account (id,"userId","accountId","providerId","updatedAt") VALUES ($1,$1,$1,$2,now())', [socialUserId, "google"]);
  await fixtureDatabase.query('INSERT INTO moa_auth.session (id,token,"userId","expiresAt","updatedAt") VALUES ($1,$2,$3,now()+interval \'1 hour\',now())', [randomUUID(), socialToken, socialUserId]);
  const socialSignature = createHmac("sha256", fixtureSecret).update(socialToken).digest("base64");
  await page.goto("about:blank", { settleMs: 0 });
  // This independent connection journey uses another synthetic proxy IP; production limits stay enabled.
  await page.send("Network.enable");
  await page.send("Network.setExtraHTTPHeaders", { headers: { "x-vercel-forwarded-for": "192.0.2.240" } });
  await page.send("Network.setCookie", { name: "better-auth.session_token", value: encodeURIComponent(`${socialToken}.${socialSignature}`), url: base, path: "/", httpOnly: true, sameSite: "Lax" });
  await page.goto(base + "/settings?tab=folders", { settleMs: 220 });
  await wait(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "폴더 연결"));
  await page.eval(async () => { const root = await navigator.storage.getDirectory(); const folder = await root.getDirectoryHandle("fixture-social-notes", { create: true }); window.showDirectoryPicker = async () => folder; [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "폴더 연결").click(); });
  await wait(() => document.body.textContent.includes("fixture-social-notes"));
  await page.goto(base + "/settings?tab=account", { settleMs: 220 });
  await wait(() => !!document.querySelector('[name="primary"]'));
  check("social-only settings offer native ownership proof and a workspace choice", await page.eval(() => document.querySelectorAll('form[aria-label="기존 계정과 작업 공간 연결"] [name="primary"]').length === 2 && !!document.querySelector('[name="confirm"]')));
  await input("email", "browser-flow@example.invalid"); await input("password", "wrong-connection-password");
  await page.eval(() => { document.querySelector('[name="primary"][value="existing"]').click(); document.querySelector('[name="confirm"]').click(); });
  await submit('form[aria-label="기존 계정과 작업 공간 연결"]');
  await wait(() => !!document.querySelector('form[aria-label="기존 계정과 작업 공간 연결"] [role="alert"]'));
  check("a rejected native proof keeps the account form and email visible without revoking the social session", await page.eval(() => location.pathname === "/settings" && document.querySelector('[name="email"]').value === "browser-flow@example.invalid" && !document.querySelector('[role="status"][aria-busy="true"]')));
  await input("password", "new-fixture-browser-password");
  await page.eval(() => { document.querySelector('[name="primary"][value="existing"]').click(); document.querySelector('[name="confirm"]').checked = true; });
  await page.screenshot({ path: join(out, "existing-account-review-1440.png"), format: "png" });
  await submit('form[aria-label="기존 계정과 작업 공간 연결"]');
  await wait(() => location.pathname === "/login" && !!document.querySelector('form[data-auth-form]'));
  check("confirmed existing-account connection clears sessions and requires a new login", await page.eval(() => !!document.querySelector('[name="password"]')));
  await input("email", "browser-flow@example.invalid"); await input("password", "new-fixture-browser-password");
  await submit(); await wait(() => location.pathname === "/");
  await page.goto(base + "/settings?tab=folders", { settleMs: 220 });
  await wait(() => document.body.textContent.includes("fixture-notes"));
  check("linking restores the selected original workspace's existing local folder handle", await page.eval(() => !document.body.textContent.includes("fixture-social-notes")));
  await page.goto(base + "/settings?tab=account", { settleMs: 220 });
  check("both original workspace choices remain available after linking", await page.eval(() => document.querySelectorAll('[name="ownerUserId"]').length === 2 && !document.querySelector('[name="password"]')));
  await page.screenshot({ path: join(out, "connected-workspaces-1440.png"), format: "png" });
  await page.setViewport({ width: 390, height: 900 });
  check("connected workspace selection fits a narrow screen", await page.eval(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(out, "connected-workspaces-390.png"), format: "png" });
  await page.eval(id => document.querySelector(`[name="ownerUserId"][value="${id}"]`).click(), socialUserId);
  await submit('form[aria-label="기존 계정과 작업 공간 연결"]');
  await wait(() => location.pathname === "/login" && !!document.querySelector('form[data-auth-form]'));
  await input("email", "browser-flow@example.invalid"); await input("password", "new-fixture-browser-password");
  await submit(); await wait(() => location.pathname === "/");
  await page.goto(base + "/settings?tab=folders", { settleMs: 220 });
  await wait(() => document.body.textContent.includes("fixture-social-notes"));
  check("a native login can reopen the social workspace without changing its original local storage key", await page.eval(() => !document.body.textContent.includes("fixture-notes") && !document.body.textContent.includes("로그인 상태를 확인하고 있어요")));
  await page.goto(base + "/preview", { settleMs: 300 });
  await sleep(300);
  check("preview validates the signed-in identity independently of the selected peer workspace", await page.eval(() => location.pathname === "/preview" && !document.body.textContent.includes("로그인 화면으로 이동하고 있어요")));
  await page.goto(base + "/settings?tab=account", { settleMs: 220 });
  await wait(() => !!document.querySelector('form[aria-label="기존 계정 연결 해제"]'));
  await page.eval(() => document.querySelector('form[aria-label="기존 계정 연결 해제"] [name="confirm"]').click());
  await submit('form[aria-label="기존 계정 연결 해제"]');
  await wait(() => location.pathname === "/login" && !!document.querySelector('form[data-auth-form]'));
  await input("email", "browser-flow@example.invalid"); await input("password", "new-fixture-browser-password");
  await submit(); await wait(() => location.pathname === "/");
  await page.goto(base + "/settings?tab=folders", { settleMs: 220 });
  await wait(() => document.body.textContent.includes("fixture-notes"));
  check("disconnecting restores the native account's own original folder without moving or deleting either workspace", await page.eval(() => !document.body.textContent.includes("fixture-social-notes")));

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
  writeFileSync(join(out, "canvas-checks.json"), JSON.stringify({ scope: "computed document canvas samples during readystatechange/initial animation frames; not an OS/GPU compositor recording", checks: canvasChecks }, null, 2));
  console.log(`Authentication UI: ${checks.length} browser checks passed.`);
} catch (error) {
  if (page) {
    await page.screenshot({ path: join(out, "failed.png"), format: "png", fullPage: true }).catch(() => {});
    const state = await page.eval(() => ({ path: location.pathname, alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent), forms: [...document.querySelectorAll('form')].map(form => ({ label: form.getAttribute("aria-label"), busy: form.getAttribute("aria-busy"), fields: [...form.elements].filter(field => !field.name?.startsWith("$ACTION")).map(field => ({ name: field.name, type: field.type, checked: field.checked, disabled: field.disabled, valid: field.validity?.valid })) })) })).catch(() => ({}));
    writeFileSync(join(out, "failure-state.json"), JSON.stringify(state, null, 2));
  }
  writeFileSync(join(out, "checks.json"), JSON.stringify({ checks, failed: true }, null, 2));
  console.error(logs.slice(-6000));
  throw error;
} finally {
  await fixtureDatabase.end();
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
