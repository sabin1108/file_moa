import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve, join, dirname, sep } from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { browserMetric, summarize } from "./metrics.mjs";
import { measurementEnvironment } from "./environment.mjs";

const manifestPath = resolve(process.argv[2]);

assert.ok(manifestPath.startsWith(resolve(".omx/settings-timing") + "\\")
  || manifestPath.startsWith(resolve(".omx/settings-timing") + "/"));

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const output = resolve("docs/verification/settings-cache-timing", manifest.session);

mkdirSync(output, { recursive: true });

const records = [];
const activeRun = {};
const children = new Map();
const nonce = randomUUID();
let sequence = 0;

process.loadEnvFile(resolve("apps/web/.env.local"));

const env = measurementEnvironment(process.env);
const requireWeb = createRequire(resolve("apps/web/package.json"));
const nextBin = requireWeb.resolve("next/dist/bin/next");

function persist() {
  writeFileSync(
    join(output, "raw.json"),
    JSON.stringify(
      {
        manifest,
        conditions: "Production copies, same DB/auth policy and UI. Original pre-cache read pattern reconstructed; not exact historical artifact. AI keys absent. All Link prefetch disabled; unique-query client navigations. No account or cookie data recorded.",
        records
      },
      null,
      2
    )
  );
  writeFileSync(join(output, "summary.json"), JSON.stringify(summarize(records), null, 2));
}

function record(value) {
  assert.ok(records.length < 2000);
  records.push({ sequence: ++sequence, at: new Date().toISOString(), ...value });
  persist();
}

function startVariant(variant, port) {
  assert.equal(
    resolve(manifest.variants[variant].app),
    resolve(dirname(manifestPath), variant, "apps/web")
  );

  const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: manifest.variants[variant].app,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set(variant, child);

  let pending = "";

  child.stdout.on("data", chunk => {
    pending += chunk.toString();

    const lines = pending.split(/\r?\n/);

    pending = lines.pop();

    for (const line of lines) {
      const marker = line.indexOf("MOA_MEASURE:");

      if (marker < 0) continue;

      try {
        const value = JSON.parse(line.slice(marker + 12));

        assert.ok(value.variant === variant && value.kind === "server");
        assert.match(value.label, /^(prepare|settings-\d+)$/);
        assert.ok(Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0);
        record({
          kind: "server",
          variant,
          run: activeRun[variant] ?? null,
          label: value.label,
          elapsedMs: value.elapsedMs,
          ...(Number.isFinite(value.authenticationMs) ? { authenticationMs: value.authenticationMs } : {}),
          callbackCalls: value.callbackCalls
        });
      } catch {
        console.error(`${variant}: rejected a malformed numeric measurement.`);
      }
    }
  });
  child.stderr.on("data", () => { });
  child.on("exit", code => console.log(JSON.stringify({ variant, stopped: true, code })));
}

async function restartVariant(variant) {
  const previous = children.get(variant);

  if (previous && previous.exitCode === null) {
    await new Promise(done => {
      previous.once("exit", done);
      previous.kill();
    });
  }

  const app = resolve(manifest.variants[variant].app);
  const cache = resolve(app, ".next/cache/fetch-cache");

  if (existsSync(cache)) {
    const actual = realpathSync(cache);

    assert.ok(actual.startsWith(realpathSync(app) + sep) && actual.endsWith(sep + "fetch-cache"));
    await rm(actual, { recursive: true });
  }

  const port = variant === "before" ? 3035 : 3036;

  startVariant(variant, port);

  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise(done => setTimeout(done, 100));

    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) return;
    } catch { }
  }

  throw new Error("Measurement server did not become ready.");
}

startVariant("before", 3035);
startVariant("after", 3036);

const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>설정 속도 비교</title><style>body{font:17px/1.7 system-ui;max-width:1100px;margin:36px auto;padding:0 24px;color:#203444;background:#f4f7f6}a{display:inline-block;margin:8px 20px 8px 0;padding:10px 16px;border:1px solid #789;color:inherit}pre{white-space:pre-wrap;background:white;padding:16px}td,th{border-bottom:1px solid #ccd;padding:10px;text-align:left}table{border-collapse:collapse;width:100%}</style><h1>설정 로딩 비교 측정</h1><p>현재 로그인한 브라우저를 사용합니다. <strong>이전 → 현재 → 현재 → 이전</strong> 순서로 각 창에서 ‘측정 시작’을 눌러 주세요. 한 번 시작하면 10회 자동 측정합니다. 완료될 때까지 그 창을 앞에 두세요.</p><p>두 버전은 실제 인증·DB를 사용합니다. 개인정보·쿠키·AI 키를 기록하지 않고 계정 설정과 파일을 변경하지 않습니다. AI 호출도 하지 않습니다.</p><p>이전 전체 빌드는 보존되어 있지 않아, 현재 화면에 캐시 도입 전 조회 방식을 복원한 비교입니다. 고유 query와 prefetch 비활성 조건이며 평소 메뉴 이동과 다를 수 있습니다.</p><a href="http://127.0.0.1:3035/bench-settings?token=${nonce}" target="settings-measurement">이전 조회 방식 측정</a><a href="http://127.0.0.1:3036/bench-settings?token=${nonce}" target="settings-measurement">현재 캐시 방식 측정</a><p id="progress">결과 준비 중</p><table><thead><tr><th>구간</th><th>이전 중앙값</th><th>현재 중앙값</th></tr></thead><tbody id="table"></tbody></table><h2>원자료와 상태</h2><pre id="results"></pre><script>async function refresh(){const r=await fetch('/results',{cache:'no-store'});const d=await r.json();document.getElementById('progress').textContent='완료: 이전 '+d.summary.before.completedRuns+'회 / 현재 '+d.summary.after.completedRuns+'회';const labels={initialWorkspace:'첫 작업 공간 진입',initialJourney:'? ??? ? ?? ??',firstSettings:'첫 설정 진입',repeatedSettings:'반복 설정 진입',settingsReader:'서버 설정 자료 조회'};document.getElementById('table').innerHTML=Object.entries(labels).map(([k,v])=>'<tr><td>'+v+'</td><td>'+(d.summary.before[k]?.medianMs?.toFixed(1)??'대기')+' ms</td><td>'+(d.summary.after[k]?.medianMs?.toFixed(1)??'대기')+' ms</td></tr>').join('');document.getElementById('results').textContent=JSON.stringify(d,null,2)}refresh();setInterval(refresh,1000)</script></html>`;

const server = createServer(async (request, response) => {
  if (request.headers.host !== "127.0.0.1:3037") {
    response.writeHead(403);
    response.end();

    return;
  }

  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);

    return;
  }

  if (request.method === "GET" && request.url === "/results") {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ summary: summarize(records), recent: records.slice(-12) }));

    return;
  }

  if (request.method !== "POST" || request.url !== "/metric"
    || !["http://127.0.0.1:3035", "http://127.0.0.1:3036"].includes(request.headers.origin)) {
    response.writeHead(403);
    response.end();

    return;
  }

  try {
    let body = "";

    for await (const chunk of request) {
      body += chunk;
      assert.ok(Buffer.byteLength(body) <= 16_384);
    }

    const payload = JSON.parse(body);

    assert.equal(payload.nonce, nonce);

    const { nonce: _nonce, ...input } = payload;
    const value = input.kind === "batch" ? browserMetric({ kind: "done", variant: input.variant, run: input.run }) : browserMetric(input);
    const expectedOrigin = value.variant === "before" ? "http://127.0.0.1:3035" : "http://127.0.0.1:3036";

    assert.equal(request.headers.origin, expectedOrigin);

    if (input.kind === "batch") {
      assert.ok(Object.keys(input).every(key => ["kind", "variant", "run", "samples"].includes(key)));
      assert.ok(Array.isArray(input.samples) && input.samples.length === 20);

      const samples = input.samples.map(browserMetric);

      samples.forEach((sample, step) => {
        assert.equal(sample.kind, "browser");
        assert.equal(sample.step, step);
        assert.equal(sample.variant, value.variant);
        assert.equal(sample.run, value.run);
      });
      samples.forEach(record);
    }

    if (value.kind === "start") {
      activeRun[value.variant] = value.run;
      await restartVariant(value.variant);
    }

    record(value);
    response.writeHead(204, { "access-control-allow-origin": request.headers.origin });
    response.end();
  } catch {
    response.writeHead(400, { "access-control-allow-origin": request.headers.origin });
    response.end();
  }
});

server.listen(3037, "127.0.0.1", () => {
  persist();
  console.log("Measurement dashboard: http://127.0.0.1:3037");
});

function stop() {
  for (const child of children.values()) child.kill();

  server.close();
  persist();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
