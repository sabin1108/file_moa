import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";
import { sceneIds } from "../../apps/web/src/prototypes/demo/scene-data.ts";

const require = createRequire(import.meta.resolve("vitest"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const output = "docs/verification/everyday-evaluation-cleanup";

mkdirSync(output, { recursive: true });

const results = [];
const server = await createServer({
  configFile: false,
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve("tests/fixtures/navigation-next-shim.tsx"),
      "next/navigation": resolve("tests/fixtures/navigation-next-shim.tsx")
    }
  },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [{
    name: "prototype-cleanup-fixture",
    configureServer(server) {
      server.middlewares.use("/__prototype", (_req, res) => {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end('<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="fixture"></div><script type="module" src="/tests/browser-fixtures/prototype-cleanup.tsx"></script></html>');
      });
    }
  }],
});

await server.listen();

const browser = await Browser.launch({ extraArgs: ["--disable-gpu", "--no-sandbox"] });

try {
  const page = await browser.newPage({ width: 1440, height: 1000 });
  const base = server.resolvedUrls.local[0];

  for (const scenario of ["chat", "files", "settings", "login", "welcome", ...sceneIds]) {
    await page.goto(`${base}__prototype?case=${scenario}`, { settleMs: 100 });

    let rendered = false;

    for (let attempt = 0; attempt < 60 && !rendered; attempt++) {
      rendered = await page.eval(scenario => document.querySelector('[data-prototype-fixture]')?.dataset.prototypeFixture === scenario
        && !!document.querySelector("main"), scenario);

      if (!rendered) await new Promise(resolve => setTimeout(resolve, 100));
    }

    const result = { scenario, rendered, exceptions: page.consoleErrors.length };

    results.push(result);
    assert.ok(rendered, `Prototype did not render: ${scenario}`);
    assert.equal(result.exceptions, 0, `Prototype exception: ${scenario}`);

    if (scenario === "files") {
      await page.screenshot({ path: `${output}/files-1440.png`, format: "png", fullPage: true });
    }
  }

  await page.setViewport({ width: 390, height: 900 });
  await page.goto(`${base}__prototype?case=files`, { settleMs: 250 });
  assert.ok(await page.eval(() => !!document.querySelector('[data-prototype-fixture="files"] main')));
  await page.screenshot({ path: `${output}/files-390.png`, format: "png", fullPage: true });
} finally {
  await browser.close();
  await server.close();
  writeFileSync(`${output}/prototype-render-checks.json`, JSON.stringify({
    condition: "Actual five prototype screens and 28 scenes rendered in Chromium with Next navigation shim; no authenticated route, state transition, real file or API claim.",
    results,
  }, null, 2) + "\n");
}

console.log(JSON.stringify({ renderedCases: results.length, exceptions: 0 }));
