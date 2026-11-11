import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { Browser } from "../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs";

const require = createRequire(import.meta.resolve("vitest"));
const webRequire = createRequire(resolve("apps/web/package.json"));
const { createServer } = await import(
  pathToFileURL(require.resolve("vite")).href
);
let renderDocument;
const server = await createServer({
  configFile: false,
  cacheDir: resolve(".omx/browser-cache/check-chat-first-hydration"),
  root: resolve("apps/web"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, fs: { allow: [resolve(".")] } },
  resolve: {
    alias: {
      "next/link": resolve(
        "apps/web/tests/browser-fixtures/next-hydration-shim.tsx",
      ),
      "next/navigation": resolve(
        "apps/web/tests/browser-fixtures/next-hydration-shim.tsx",
      ),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [
    {
      name: "ssr-hydration-fixture",
      configureServer(server) {
        server.middlewares.use("/__ssr-chat-first", (_request, response) => {
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(renderDocument());
        });
      },
    },
  ],
});

await server.listen();

const React = await import(pathToFileURL(webRequire.resolve("react")).href);
const { renderToString } = await import(
  pathToFileURL(webRequire.resolve("react-dom/server")).href
);
const { default: RootLayout } = await server.ssrLoadModule(
  "/src/app/layout.tsx",
);
const { ChatFirstPrototype } = await server.ssrLoadModule(
  "/src/prototypes/organization/ChatFirstPrototype.tsx",
);

renderDocument = () => {
  const children = React.createElement(
    React.Fragment,
    null,
    React.createElement(ChatFirstPrototype),
    React.createElement("script", {
      type: "module",
      async: true,
      src: "/tests/browser-fixtures/chat-first-hydrate.tsx",
    }),
  );

  return (
    "<!doctype html>" +
    renderToString(React.createElement(RootLayout, { children }))
  );
};

const url = `http://127.0.0.1:${server.httpServer.address().port}/__ssr-chat-first`;
const output = process.argv[2] ?? "docs/verification/chat-first-live";

mkdirSync(output, { recursive: true });

const browser = await Browser.launch({
  extraArgs: [
    "--disable-gpu",
    "--disable-gpu-compositing",
    "--disable-software-rasterizer",
    "--no-sandbox",
  ],
});
const results = [];

try {
  for (const injected of [false, true]) {
    const page = await browser.newPage({ width: 1440, height: 1000 });
    const consoleMessages = [];

    browser.on(page.sessionId, "Runtime.consoleAPICalled", (event) => {
      if (["error", "warning"].includes(event.type))
        consoleMessages.push(
          event.args
            .map((argument) => argument.value ?? argument.description ?? "")
            .join(" "),
        );
    });

    if (injected)
      await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `new MutationObserver((_, observer) => { if (document.documentElement) { document.documentElement.setAttribute('data-map-dyoa-ext', '1.3.0'); observer.disconnect(); } }).observe(document, { childList: true, subtree: true });`,
      });

    await page.goto(url, { settleMs: 800 });

    const ready = await page.eval(() => "hydrationFixtureReady" in window);
    const warnings = [...page.consoleErrors, ...consoleMessages].filter(
      (value) => /hydrat|server rendered|server-rendered/iu.test(value),
    );

    results.push({
      injected,
      ready,
      warnings,
      allErrors: page.consoleErrors,
      consoleMessages,
    });
    assert.equal(ready, true);

    if (injected)
      assert.ok(
        warnings.length > 0,
        "The supplied external attribute reproduces the hydration warning",
      );
    else
      assert.deepEqual(
        [...page.consoleErrors, ...consoleMessages],
        [],
        "The unmodified server HTML hydrates without mismatch",
      );

    await page.close();
  }
} finally {
  writeFileSync(
    `${output}/hydration-checks.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        condition:
          "Actual RootLayout and preview component, isolated React SSR/hydration with Next navigation shim; no authentication or user extension access",
        results,
      },
      null,
      2,
    ),
  );
  await browser.close();
  await server.close();
}

console.log(
  "Clean SSR hydration passed; supplied external attribute warning reproduced.",
);
