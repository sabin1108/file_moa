import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { app as appProbe } from "../../.agents/skills/design-taste-frontend/scripts/lib/probe.mjs";
import { judgeApp } from "../../.agents/skills/design-taste-frontend/scripts/lib/rules.mjs";

const output = resolve(process.argv[2] ?? "docs/verification/animation-replacement/browser");
mkdirSync(output, { recursive: true });
const checks = [];
const check = (name, pass) => { checks.push({ name, pass: !!pass }); assert.ok(pass, name); };
function keyframes(css) {
  const frames = new Map();
  for (const match of css.matchAll(/@keyframes\s+(\w+)\s*\{/gu)) {
    let depth = 1;
    let end = match.index + match[0].length;
    for (; depth && end < css.length; end++) {
      if (css[end] === "{") depth++;
      if (css[end] === "}") depth--;
    }
    assert.equal(depth, 0, "balanced CSS keyframe");
    frames.set(match[1], css.slice(match.index, end).replace(/\s+/gu, ""));
  }
  return frames;
}
const loadingReference = keyframes(readFileSync("C:/Users/sabin/Desktop/animation/loding/FolderVortexLoading.module.css", "utf8"));
const paperReference = keyframes(readFileSync("C:/Users/sabin/Desktop/animation/로그인 애니메이션_최종본/PaperSignupStepper.module.css", "utf8"));
const loader = keyframes(readFileSync("apps/web/src/components/ui/feedback/moa-loader.module.css", "utf8"));
const paper = keyframes(readFileSync("apps/web/src/components/ui/paper-stepper.module.css", "utf8"));
assert.equal(keyframes(readFileSync("apps/web/src/components/ui/feedback/page-loading.module.css", "utf8")).get("slide"), loadingReference.get("slide"), "indeterminate track motion");
for (const [name, body] of [...loader, ...paper]) assert.equal(body, (loader.has(name) ? loadingReference : paperReference).get(name), name);
check("all shipped vortex/fold/yank keyframes match the supplied motion", loader.size === 6 && paper.has("pMove") && paper.has("yMove"));
check("old logo stroke animation and auth reveal animation are removed", !/@keyframes link|loader path:first-child/u.test(readFileSync("apps/web/src/components/ui/feedback/status-notice.module.css", "utf8")) && !/revealField|revealedField/u.test(readFileSync("apps/web/src/components/layout/auth-shell.module.css", "utf8")));
check("auth uses the replacement rather than rendering the old stepper beside it", ["AuthScreen", "SignupScreen"].every(file => !/WorkflowStepper/u.test(readFileSync(`apps/web/src/features/auth/components/${file}.tsx`, "utf8"))));
const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({ configFile: false, root: resolve("apps/web"), cacheDir: resolve(".omx/browser-cache/animation"), logLevel: "error", server: { host: "127.0.0.1", port: 4188, fs: { allow: [resolve(".")] } }, resolve: { alias: { "next/image": resolve("tests/fixtures/image-next-shim.tsx"), "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"), "next/navigation": resolve("tests/fixtures/animation-next-shim.tsx"), "@personal-ai/domain": resolve("packages/domain/src/index.ts") } }, oxc: { jsx: { runtime: "automatic" } }, plugins: [{ name: "animation-fixture", configureServer(server) {
  server.middlewares.use("/__animation", (_request, response) => { response.setHeader("content-type", "text/html; charset=utf-8"); response.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/animation-replacement.tsx"></script></html>'); });
} }] });
await server.listen();
const browser = await Browser.launch({ extraArgs: ["--no-sandbox", "--disable-gpu"] });
let page;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let attempt = 0; attempt < 400; attempt++) { if (await page.eval(`Boolean((${predicate.toString()})())`)) return; await pause(25); }
  throw new Error("Timeout: " + predicate);
}
async function click(selector) { await page.eval(selector => { const button = document.querySelector(selector); assertButton(button); button.click(); function assertButton(button) { if (!button || button.disabled) throw new Error("Missing enabled " + selector); } }, selector); }
async function fill(selector, text) {
  await page.eval(selector => { const input = document.querySelector(selector); input.focus(); input.select(); }, selector);
  await page.send("Input.insertText", { text });
}
try {
  page = await browser.newPage({ width: 1440, height: 1000 });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/__animation`;
  await page.goto(url, { settleMs: 350 });
  await until(() => document.getElementById("auth-email"));
  check("large decorative stepper replaces the left sketch while semantic steps stay with the form", await page.eval(() => {
    const visual = document.querySelector('[data-auth-illustration] [data-paper-visual]');
    const steps = document.querySelector('[data-paper-stepper]');
    return visual && visual.getBoundingClientRect().width > 480 && steps.closest('section').querySelector('form') && !steps.querySelector('[data-paper-visual]') && !document.body.innerText.includes('공부 노트');
  }));
  await click('[data-signup-control]');
  check("invalid email does not advance or animate", await page.eval(() => document.querySelector('[aria-current="step"]').textContent.includes("이메일") && !document.querySelector('[data-paper-flight]') && animationProbe.calls === 0));
  await fill('#auth-email', "animation@example.invalid");
  await page.eval(() => document.querySelector('#auth-email').dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  check("composition Enter does not submit or advance", await page.eval(() => !document.getElementById("auth-password") && animationProbe.calls === 0));
  await page.eval(() => document.querySelector('#auth-email').dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await click('[data-signup-control]');
  await until(() => document.querySelector('[data-paper-flight="in"]'));
  check("a validated step advances immediately while the old paper folds for 3000ms", await page.eval(() => document.getElementById("auth-password") && document.querySelector('[data-paper-flight="in"]').style.getPropertyValue("--T") === "3000ms" && location.search.includes("password")));
  await fill('#auth-password', "fixture-password-1234");
  await fill('#auth-passwordConfirm', "fixture-password-1234");
  check("decorative papers never copy input values or passwords", await page.eval(() => !document.querySelector('[data-auth-illustration]').textContent.includes("fixture-password") && !document.querySelector('[data-auth-illustration]').textContent.includes("animation@example")));
  await pause(1200);
  await page.screenshot({ path: resolve(output, "signup-fold-1440.png"), format: "png" });
  await click('[data-signup-back]');
  await until(() => document.querySelector('[data-paper-flight="out"]'));
  check("back uses the supplied 1100ms yank animation", await page.eval(() => document.querySelector('[data-paper-flight="out"]').dataset.yank === "true" && document.querySelector('[data-paper-flight="out"]').style.getPropertyValue("--T") === "1100ms"));
  await click('[data-signup-control]');
  check("fast reversal replaces the same step flight instead of duplicating it", await page.eval(() => document.querySelectorAll('[data-paper-flight]').length === 1 && !!document.querySelector('[data-paper-flight="in"]')));
  await page.eval(() => history.back());
  await until(() => document.querySelector('[aria-current="step"]')?.textContent.includes("이메일"));
  await page.eval(() => history.forward());
  await until(() => document.getElementById("auth-password"));
  check("browser back and forward drive the real signup URL state", await page.eval(() => location.search.includes("password") && document.querySelector('[aria-current="step"]').textContent.includes("비밀번호")));
  await page.goto(url + "?step=password", { settleMs: 300 });
  await until(() => document.getElementById("auth-password"));
  check("reload restores the actual stage and email without replaying flights or passwords", await page.eval(() => document.getElementById("auth-email").value === "animation@example.invalid" && document.getElementById("auth-password").value === "" && !document.querySelector('[data-paper-flight]')));
  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
    check(`signup stage fits ${width}px with full-size inputs`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && parseFloat(getComputedStyle(document.getElementById("auth-password")).fontSize) >= 14 && document.getElementById("auth-password").getBoundingClientRect().height >= 44));
    if (width === 390) check("mobile retains current-step semantics and hides only decoration", await page.eval(() => document.querySelector('[aria-current="step"]').getClientRects().length && !document.querySelector('[data-auth-illustration]').getClientRects().length));
    await page.screenshot({ path: resolve(output, `signup-${width}.png`), format: "png" });
  }
  await click('[data-mode="motion"]');
  await click('[data-step="password"]');
  await until(() => document.querySelector('[data-paper-flight="in"]'));
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await until(() => !document.querySelector('[data-paper-flight]'));
  await click('[data-step="verification"]');
  check("changing reduced motion during a flight clears it and new steps remain immediate", await page.eval(() => !document.querySelector('[data-paper-flight]') && document.querySelector('[aria-current="step"]').textContent.includes("이메일 확인")));
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
  await click('[data-step="password"]');
  await until(() => document.querySelector('[data-paper-flight="out"]'));
  await click('[data-mount]'); await pause(1200); await click('[data-mount]');
  check("unmount clears flight timers without replaying stale animation on remount", await page.eval(() => !document.querySelector('[data-paper-flight]')));
  for (const mode of ["loading", "compact"]) {
    await click(`[data-mode="${mode}"]`);
    for (const width of [390, 768, 1440]) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
      check(`${mode} loader fits ${width}px`, await page.eval(() => document.documentElement.scrollWidth <= innerWidth && document.querySelectorAll('[data-folder-loader] [data-loader-paper]').length >= 10));
      await page.screenshot({ path: resolve(output, `${mode}-${width}.png`), format: "png" });
    }
  }
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  check("reduced loading has no running animation", await page.eval(() => [...document.querySelectorAll('[data-folder-loader] *')].every(node => getComputedStyle(node).animationName === "none")));
  await click('[data-mode="login"]');
  await fill('#auth-email', "animation@example.invalid"); await fill('#auth-password', "fixture-password-1234");
  await page.eval(() => document.querySelector('[data-auth-form]').requestSubmit());
  await until(() => animationProbe.calls === 1 && animationProbe.finish);
  check("real login pending uses the replacement and blocks duplicate submission", await page.eval(() => !!document.querySelector('[data-folder-loader]') && document.querySelector('[data-auth-form] fieldset').disabled));
  await page.eval(() => animationProbe.finish());
  await until(() => document.body.innerText.includes("합성 요청 종료"));
  check("login settles and removes its pending loader", await page.eval(() => !document.querySelector('[data-auth-form] [data-folder-loader]') && !document.querySelector('[data-auth-form] fieldset').disabled));
  await click('[data-overlay]');
  check("navigation feedback remains a nonblocking portal", await page.eval(() => !!document.querySelector('[data-navigation-loading] [data-folder-loader]') && getComputedStyle(document.querySelector('[data-navigation-loading]')).pointerEvents === "none"));
  await click('[data-overlay]');
  check("completed navigation removes its animation", !await page.eval(() => document.querySelector('[data-navigation-loading]')));
  await page.eval(() => { localStorage.removeItem('moa-signup-draft-v1'); sessionStorage.removeItem('moa-auth-input'); });
  await page.goto(url, { settleMs: 300 });
  await until(() => document.getElementById("auth-email"));
  await page.eval(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'moa-signup-draft-v1' || key === 'moa-auth-input') throw new DOMException('Fixture blocked storage', 'SecurityError');
      return original.call(this, key, value);
    };
  });
  await fill('#auth-email', 'blocked-signup@example.invalid');
  await click('[data-signup-control]');
  await until(() => document.getElementById('auth-password'));
  check("blocked signup storage keeps the typed email and actual step in this tab", await page.eval(() => document.getElementById('auth-email').value === 'blocked-signup@example.invalid' && document.querySelector('[aria-current="step"]').textContent.includes('비밀번호') && !localStorage.getItem('moa-signup-draft-v1')?.includes('blocked-signup')));
  await click('[data-mode="login"]');
  await fill('#auth-email', 'blocked-login@example.invalid');
  await fill('#auth-password', 'not-persisted-fixture-password');
  check("blocked login draft storage keeps input without persisting email or password", await page.eval(() => document.getElementById('auth-email').value === 'blocked-login@example.invalid' && document.getElementById('auth-password').value === 'not-persisted-fixture-password' && !sessionStorage.getItem('moa-auth-input')?.includes('blocked-login') && !sessionStorage.getItem('moa-auth-input')?.includes('not-persisted')));
  await page.eval(() => { window.BroadcastChannel = class { constructor() { throw new Error('Fixture blocked channel'); } }; });
  await click('[data-mode="boundary"]');
  await until(() => animationProbe.sessionChecks === 1 && document.querySelector('[data-owner-visible]'));
  await click('[data-session-change]');
  await until(() => animationProbe.sessionChecks === 2 && document.querySelector('[data-owner-visible]'));
  await page.eval(() => window.dispatchEvent(new Event('focus')));
  await until(() => animationProbe.sessionChecks === 3);
  check("blocked BroadcastChannel preserves owner boundary local and lifecycle checks", await page.eval(() => !!document.querySelector('[data-owner-visible]')));
  await click('[data-mode="guest"]');
  await until(() => document.querySelector('[data-guest-visible]'));
  await click('[data-session-change]');
  await until(() => animationProbe.sessionChecks === 4);
  check("blocked BroadcastChannel preserves guest same-tab authentication checks", await page.eval(() => !!document.querySelector('[data-guest-visible]')));
  await click('[data-mode="login"]');
  await until(() => document.querySelector('[data-auth-form]'));
  const inspected = await page.eval(appProbe);
  const verdict = judgeApp(inspected);
  check("app inspector reports no failing findings", !verdict.some(finding => finding.level === "FAIL"));
  writeFileSync(resolve(output, "taste.json"), JSON.stringify({ inspected, verdict }, null, 2));
  check("no browser exceptions", page.consoleErrors.length === 0);
  writeFileSync(resolve(output, "checks.json"), JSON.stringify({ checks, keyframes: { loader: [...loader.keys()], paper: [...paper.keys()] }, condition: "Actual product auth/loader/paper components in isolated Chromium, synthetic action and Next navigation shim, synthetic IME, no account/auth API/mail/model or native permission operations. Motion keyframes compared to the supplied local files; decorative papers carry step labels only." }, null, 2));
  console.log(`${checks.length} animation replacement browser checks passed.`);
} catch (error) {
  writeFileSync(resolve(output, "failure.json"), JSON.stringify({ checks, error: String(error), consoleErrors: page?.consoleErrors, text: page ? await page.eval(() => document.body.innerText) : "" }, null, 2));
  throw error;
} finally { await browser.close(); await server.close(); }
