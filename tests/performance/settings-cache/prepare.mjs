import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { measurementEnvironment } from "./environment.mjs";

const repo = resolve(".");
const session = process.argv[2] ?? new Date().toISOString().replace(/[:.]/g, "-");

assert.match(session, /^[a-zA-Z0-9_-]+$/);

const root = resolve(".omx/settings-timing", session);

assert.ok(
  !existsSync(root),
  "Use a fresh snapshot directory; existing results are never overwritten."
);

const web = resolve("apps/web");
const requireWeb = createRequire(join(web, "package.json"));
const nextBin = requireWeb.resolve("next/dist/bin/next");

process.loadEnvFile(join(web, ".env.local"));

const env = measurementEnvironment(process.env);
const manifest = {
  at: new Date().toISOString(),
  session,
  root,
  comparison: "reconstructed pre-cache read pattern vs blocking settings cache; not exact historical build",
  variants: {}
};

function edit(path, transform) {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  const next = transform(source);

  assert.notEqual(next, source, `Expected instrumentation point in ${path}`);
  writeFileSync(path, next);
}

for (const variant of ["before", "after"]) {
  const app = join(root, variant, "apps/web");

  mkdirSync(app, { recursive: true });

  for (const name of ["src", "public", "prisma", "generated", "package.json", "tsconfig.json", "next-env.d.ts", "next.config.ts"]) {
    cpSync(join(web, name), join(app, name), { recursive: true });
  }

  cpSync(resolve("tsconfig.base.json"), join(root, variant, "tsconfig.base.json"));
  symlinkSync(join(web, "node_modules"), join(app, "node_modules"), "junction");
  cpSync(
    resolve("tests/performance/settings-cache/Probe.tsx"),
    join(app, "src/components/SettingsMeasurementProbe.tsx")
  );
  writeFileSync(
    join(app, "src/components/MeasurementLink.tsx"),
    '"use client";\nimport Link from "next/dist/client/link";\nimport type { ComponentProps } from "react";\nexport default function MeasurementLink(props: ComponentProps<typeof Link>) { return <Link {...props} prefetch={false} />; }\n'
  );

  const alias = join(app, "src/components/MeasurementLink.tsx");

  edit(
    join(app, "next.config.ts"),
    source => source.replace(
      'transpilePackages: ["@personal-ai/domain"],',
      `transpilePackages: ["@personal-ai/domain"],\n  turbopack: { root: ${JSON.stringify(repo)}, resolveAlias: { "next/link": ${JSON.stringify(alias)} } },`
    )
  );
  mkdirSync(join(app, "src/app/bench-settings"), { recursive: true });
  writeFileSync(
    join(app, "src/app/bench-settings/page.tsx"),
    `import { StartMeasurement } from "../../components/SettingsMeasurementProbe";\nexport default function Page() { return <StartMeasurement variant="${variant}" />; }\n`
  );
  edit(join(app, "src/app/(workspace)/page.tsx"), source => source
    .replace(
      'export default function Home() {',
      'export default async function Home({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {\n  const params = await searchParams;'
    )
    .replace(
      'import { LiveConversation }',
      'import { SettingsMeasurementProbe } from "../../components/SettingsMeasurementProbe";\nimport { LiveConversation }'
    )
    .replace(
      'return <LiveConversation',
      'return <><SettingsMeasurementProbe variant="' + variant + '" phase="home" run={String(params.__settings_measure ?? "")} step={Number(params.step ?? 0)} /><LiveConversation'
    )
    .replace(
      'organizeAction={liveOrganizationAction.bind(null, provider)} />;',
      'organizeAction={liveOrganizationAction.bind(null, provider)} /></>;'
    ));

  const pagePath = join(app, "src/app/(workspace)/settings/page.tsx");

  edit(pagePath, source => source
    .replace(
      'import { SourceFolderSettings }',
      'import { SettingsMeasurementProbe } from "../../../components/SettingsMeasurementProbe";\nimport { SourceFolderSettings }'
    )
    .replace(
      'readSettingsDisplay(requestHeaders)',
      'readSettingsDisplay(requestHeaders, `settings-${Number(params.step ?? 0)}`)'
    )
    .replace(
      '<WorkspaceShell title="설정"',
      `<><SettingsMeasurementProbe variant="${variant}" phase="settings" run={String(params.__settings_measure ?? "")} step={Number(params.step ?? 0)} /><WorkspaceShell title="설정"`
    )
    .replace(
      '</WorkspaceShell>',
      '</WorkspaceShell></>'
    ));

  const displayPath = join(app, "src/server/settings-display.ts");
  // Preserve the original blocking comparison; background preparation needs a separate measurement.

  edit(join(app, "src/app/(workspace)/layout.tsx"), source => source
    .replace('import { after } from "next/server";\n', '')
    .replace(
      '  const requestHeaders = await headers();\n  after(() => prepareSettingsDisplay(requestHeaders));\n',
      variant === "before" ? '' : '  await prepareSettingsDisplay(await headers());\n'
    ));

  if (variant === "before") {
    writeFileSync(
      displayPath,
      `import "server-only";\nimport { readAccountLoginSettings } from "./auth-account";\nimport { readWorkspaceConnection } from "./auth-account-connection";\nexport async function readSettingsDisplay(headers: Headers, label = "prepare") {\n  const began = performance.now();\n  const [account,connection] = await Promise.all([readAccountLoginSettings(headers), readWorkspaceConnection(headers)]);\n  console.log("MOA_MEASURE:" + JSON.stringify({kind:"server",variant:"before",label,elapsedMs:performance.now()-began,callbackCalls:1}));\n  return {account,connection};\n}\nexport async function prepareSettingsDisplay(_headers: Headers) {}\n`
    );
  } else {
    edit(displayPath, source => source
      .replace(
        'readSettingsDisplay(headers: Headers)',
        'readSettingsDisplay(headers: Headers, label = "prepare")'
      )
      .replace(
        '  const session = await getAuthenticatedSession(headers);',
        '  const began = performance.now();\n  let callbackCalls = 0;\n  const session = await getAuthenticatedSession(headers);\n  const authenticationMs = performance.now() - began;'
      )
      .replace(
        '  return unstable_cache(async () => {',
        '  const result = await unstable_cache(async () => {\n    callbackCalls++;'
      )
      .replace(
        '  })();',
        '  })();\n  console.log("MOA_MEASURE:" + JSON.stringify({kind:"server",variant:"after",label,elapsedMs:performance.now()-began,authenticationMs,callbackCalls}));\n  return result;'
      ));
  }

  manifest.variants[variant] = {
    app,
    sourceHashes: Object.fromEntries(["src/server/settings-display.ts", "src/app/(workspace)/layout.tsx", "src/app/(workspace)/settings/page.tsx"].map(name => [name, createHash("sha256").update(readFileSync(join(app, name))).digest("hex")])),
  };
}

writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));

for (const variant of ["before", "after"]) {
  const app = manifest.variants[variant].app;

  await new Promise((done, fail) => {
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
        console.error(log.slice(-3000));
        fail(Error(`${variant} build failed`));

        return;
      }

      manifest.variants[variant].buildId = readFileSync(join(app, ".next/BUILD_ID"), "utf8").trim();
      console.log(JSON.stringify({ variant, build: "passed", buildId: manifest.variants[variant].buildId }));
      done();
    });
  });
}

writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ manifest: join(root, "manifest.json") }));
