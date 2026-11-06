import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const next = requireWeb.resolve("next/dist/bin/next");
const out = join(root, "docs/verification/auth-social-settings/browser");
mkdirSync(out, { recursive: true });
mkdirSync(cache, { recursive: true });
const app = mkdtempSync(join(cache, "moa-auth-browser-"));
const mails = [];
const checks = [];
const designChecks = [];
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
  const signupTop = await page.eval(() => document.querySelector("h1").getBoundingClientRect().top);
  check("forged completion URL returns to the name field", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이름") && !document.querySelector('[name="email"]')));
  await input("name", "가상 사용자");
  check("signup IME Enter does not advance", await page.eval(() => !document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })) && !document.querySelector('[name="email"]')));
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await wait(() => !!document.querySelector('[name="email"]'));
  check("name Enter reveals email below the retained name", await page.eval(() => document.querySelector('[name="name"]').value === "가상 사용자" && !document.querySelector('[name="password"]')));
  await page.eval(() => history.back());
  await wait(() => location.search === "?step=name" && !document.querySelector('[name="email"]'));
  await page.eval(() => document.querySelector('[name="name"]').focus());
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await wait(() => document.activeElement?.getAttribute("name") === "email");
  check("name Tab enters the newly revealed email instead of skipping it", true);
  check("revealing an input keeps the form heading anchored", Math.abs(await page.eval(() => document.querySelector("h1").getBoundingClientRect().top) - signupTop) < 1);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  check("reduced motion disables input reveal animation", await page.eval(() => getComputedStyle(document.querySelector('[name="email"]').closest('[class*="revealedField"]')).animationName === "none"));
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await input("email", "browser-flow@example.invalid");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await wait(() => !!document.querySelector('[name="password"]'));
  check("email Tab enters the newly revealed password on the same form", await page.eval(() => !!document.querySelector('[name="passwordConfirm"]') && document.activeElement?.getAttribute("name") === "password" && document.querySelectorAll('form[data-auth-form]').length === 1));
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
  check("reload keeps identity inputs but never passwords", await page.eval(() => document.querySelector('[name="name"]').value === "가상 사용자" && document.querySelector('[name="password"]').value === ""));
  const previousPage = page;
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.goto(base + "/welcome", { settleMs: 180 });
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

  for (const width of [390, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    for (const tab of ["account", "folders", "editor"]) {
      await page.goto(base + "/settings?tab=" + tab, { settleMs: 220 });
      check(`settings ${tab} fits ${width}px`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll("h1").length === 1));
      check(`settings ${tab} has real account entry and no obsolete login notice`, await page.eval(() => !!document.querySelector('a[href="/account"]') && !document.body.textContent.includes("실제 로그인은 아직 연결되지 않았습니다")));
      if (tab === "account") check("social account settings show three real provider actions", await page.eval(() => document.querySelectorAll('[aria-label="소셜 로그인 연결 관리"] button').length === 3));
      const metrics = await page.eval(probe);
      const arrangement = await page.eval(layout);
      const appMetrics = await page.eval(appProbe);
      const findings = [...judge(metrics, { width }), ...judgeLayout(arrangement, { width })].filter(finding => !APP_SKIP.has(finding.id) && finding.id !== "no-title" && finding.id !== "small-title").concat(judgeApp(appMetrics, metrics, { width }));
      designChecks.push({ tab, width, findings });
      check(`taste app inspection ${tab} at ${width}px has no failure`, !findings.some(finding => finding.level === "FAIL"));
      await page.screenshot({ path: join(out, `settings-${tab}-${width}.png`), format: "png" });
    }
  }
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
