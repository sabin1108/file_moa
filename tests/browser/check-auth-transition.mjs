import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { spawn } from "node:child_process";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const repo = resolve(".");
const root = resolve(".omx/auth-transition", new Date().toISOString().replace(/[:.]/g, "-"));
const output = resolve("docs/verification/auth-transition");
const requireWeb = createRequire(resolve("apps/web/package.json"));
const nextBin = requireWeb.resolve("next/dist/bin/next");
const allowed = ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA"];
const env = {
  ...Object.fromEntries(allowed.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1"
};
const checks = [];
const samples = [];
const builds = {};
const check = (name, passed) => {
  checks.push({ name, passed: Boolean(passed) });
  assert.ok(passed, name);
};
const pause = ms => new Promise(done => setTimeout(done, ms));
const importFrom = (file, target) => JSON.stringify(relative(dirname(file), resolve(target)).replaceAll("\\", "/").replace(/\.tsx?$/, ""));

mkdirSync(output, { recursive: true });

async function wait(page, predicate) {
  for (let index = 0; index < 160; index++) {
    if (await page.eval(`Boolean((${predicate.toString()})())`)) return;

    await pause(35);
  }

  throw Error("Authentication transition fixture did not become ready.");
}

function build(app, variant) {
  return new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      [nextBin, "build"],
      { cwd: app, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let log = "";

    child.stdout.on("data", data => {
      log += data;
    });
    child.stderr.on("data", data => {
      log += data;
    });
    child.on("error", fail);
    child.on("exit", code => {
      writeFileSync(join(root, `${variant}-build.log`), log);

      if (code !== 0) {
        fail(Error(log.slice(-2500)));

        return;
      }

      done();
    });
  });
}

let browser;
let server;

try {
  browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });

  for (const variant of ["before", "after"]) {
    const app = join(root, variant);
    const appDir = join(app, "app");

    mkdirSync(join(appDir, "(workspace)"), { recursive: true });
    mkdirSync(join(appDir, "login"), { recursive: true });
    symlinkSync(resolve("apps/web/node_modules"), join(app, "node_modules"), "junction");
    writeFileSync(join(app, "package.json"), JSON.stringify({ private: true }));
    writeFileSync(
      join(app, "tsconfig.json"),
      JSON.stringify({
        extends: relative(app, resolve("tsconfig.base.json")).replaceAll("\\", "/"),
        compilerOptions: { jsx: "react-jsx", lib: ["DOM", "DOM.Iterable", "ES2022"], incremental: false },
        include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"]
      })
    );
    writeFileSync(
      join(app, "next.config.mjs"),
      `export default { turbopack: { root: ${JSON.stringify(repo)} }, transpilePackages: ["@personal-ai/domain"] };`
    );

    const layout = join(appDir, "layout.tsx");

    writeFileSync(
      layout,
      `export { default, metadata } from ${importFrom(layout, "apps/web/src/app/layout.tsx")};`
    );

    if (variant === "after") {
      const loading = join(appDir, "loading.tsx");

      writeFileSync(
        loading,
        `export { default } from ${importFrom(loading, "apps/web/src/app/loading.tsx")};`
      );
    }

    writeFileSync(join(appDir, "(workspace)/layout.tsx"), `import { headers } from "next/headers";
import { redirect } from "next/navigation";
export default async function Layout({children}: {children: React.ReactNode}) {
  const requestHeaders = await headers();
  await new Promise(done => setTimeout(done, 1800));
  if (requestHeaders.get("cookie")?.includes("fixture-denied=1")) redirect("/login");
  return <>{children}</>;
}`);
    writeFileSync(
      join(appDir, "(workspace)/page.tsx"),
      'export default function Page() { return <main data-fixture-main><h1>합성 작업 공간</h1><label>시험 입력<textarea aria-label="시험 입력" /></label></main>; }'
    );
    writeFileSync(
      join(appDir, "login/page.tsx"),
      'export default function Page() { return <main data-fixture-login>로그인이 필요합니다.</main>; }'
    );
    await build(app, variant);
    builds[variant] = readFileSync(join(app, ".next/BUILD_ID"), "utf8").trim();
    console.log(JSON.stringify({ variant, build: "passed" }));
    server = spawn(
      process.execPath,
      [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3035"],
      { cwd: app, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );

    let serverLog = "";

    server.stdout.on("data", chunk => {
      serverLog += chunk;
    });
    server.stderr.on("data", chunk => {
      serverLog += chunk;
    });

    for (let attempt = 0; ; attempt++) {
      if (serverLog.includes("Ready in")) break;

      assert.ok(attempt < 150 && server.exitCode === null, "Owned fixture server must start");
      await pause(40);
    }

    for (const width of [390, 1440, 1920]) {
      const page = await browser.newPage({ width, height: 900, reducedMotion: width === 390 });

      await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `window.transitionProbe = { loadingMs: null, readyMs: null, leaked: false };
new MutationObserver(() => {
  const status = document.querySelector('[role="status"][aria-busy="true"]');
  const main = document.querySelector('[data-fixture-main]');
  if (status?.checkVisibility() && window.transitionProbe.loadingMs === null) window.transitionProbe.loadingMs = performance.now();
  if (main?.checkVisibility() && window.transitionProbe.readyMs === null) window.transitionProbe.readyMs = performance.now();
  if (document.cookie.includes('fixture-denied=1') && main?.checkVisibility()) window.transitionProbe.leaked = true;
}).observe(document, { childList: true, subtree: true, attributes: true });`
      });
      await page.send("Page.navigate", { url: "http://127.0.0.1:3035/" });

      if (variant === "after") {
        await wait(page, () => document.querySelector('[role="status"][aria-busy="true"]')?.checkVisibility());
        check(
          `${width}: pending guard exposes only public status`,
          !(await page.eval(() => document.querySelector('[data-fixture-main]')?.checkVisibility()))
        );
        check(
          `${width}: loading fits viewport`,
          await page.eval(() => document.documentElement.scrollWidth <= innerWidth)
        );

        if (width === 390) check(
          "reduced motion disables loader animation",
          await page.eval(() => getComputedStyle(document.querySelector('[role="status"] svg path')).animationName === "none")
        );

        await page.screenshot({ path: join(output, `loading-${width}.png`), format: "png" });
      }

      await wait(page, () => document.querySelector('[data-fixture-main]')?.checkVisibility());

      const sample = await page.eval(() => window.transitionProbe);

      samples.push({ variant, width, ...sample });

      if (variant === "after") {
        check(
          `${width}: status precedes main`,
          sample.loadingMs !== null && sample.loadingMs < sample.readyMs
        );
        await page.eval(() => document.querySelector('textarea').focus());
        await page.send("Input.insertText", { text: "자료 확인" });
        check(
          `${width}: ready screen accepts keyboard input`,
          await page.eval(() => document.querySelector('textarea').value === "자료 확인")
        );
        check(
          `${width}: loading is removed after readiness`,
          !(await page.eval(() => document.querySelector('[role="status"]')?.checkVisibility()))
        );
        await page.send("Network.setCookie", { name: "fixture-denied", value: "1", url: "http://127.0.0.1:3035" });
        await page.send("Page.navigate", { url: "http://127.0.0.1:3035/" });
        await wait(page, () => document.querySelector('[data-fixture-login]')?.checkVisibility());
        check(
          `${width}: rejected guard never exposes main`,
          await page.eval(() => !window.transitionProbe.leaked && !document.querySelector('[data-fixture-main]'))
        );
        await page.send("Network.clearBrowserCookies");
      } else {
        check(`${width}: baseline reproduces missing pending UI`, sample.loadingMs === null);
      }

      check(`${variant} ${width}: no browser exceptions`, page.consoleErrors.length === 0);
      await page.close();
    }

    const ended = new Promise(done => server.once("exit", done));

    server.kill();
    await ended;
    server = undefined;
  }

  check("both fixture variants finish", samples.length === 6);
} finally {
  server?.kill();

  if (browser) await browser.close();

  writeFileSync(
    join(output, "browser-checks.json"),
    JSON.stringify(
      {
        conditions: "Production Next fixture reusing actual RootLayout and PageLoading; nested layout has synthetic 1800ms guard. No OAuth, DB, account cookie or model API. Timing describes fixture DOM readiness, not real sign-in latency.",
        builds,
        checks,
        samples
      },
      null,
      2
    )
  );
}

console.log(JSON.stringify({ checks: checks.length, samples: samples.length, passed: true }));
