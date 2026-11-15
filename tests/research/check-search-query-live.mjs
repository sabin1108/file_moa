import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

process.loadEnvFile("apps/web/.env.local");
assert.ok(process.execArgv.includes("--conditions=react-server"), "Run Node with --conditions=react-server for the real server-only modules");
const require = createRequire(import.meta.resolve("vitest"));
const webRequire = createRequire(resolve("apps/web/package.json"));
const serverOnlyEntry = webRequire.resolve("server-only");
assert.ok(serverOnlyEntry.endsWith("empty.js"), "The package must resolve its official react-server export");
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({ configFile: false, root: resolve("apps/web"), logLevel: "error", resolve: { alias: { "server-only": serverOnlyEntry } }, ssr: { noExternal: ["server-only"] } });
const output = resolve(".omx/verification/local-rag-20261115/live-query");
mkdirSync(output, { recursive: true });
const questions = ["가온센터 이력서 찾아줘", 'Next.js "로그인 오류" 초안 말고 찾아줘', "빵을 만들 때 부피가 커지는 이유에 관한 메모 찾아줘"];
const price = { "gpt-6-luna": { input: 0.10, output: 0.50 }, "gemini-3.5-flash-lite": { input: 0.30, output: 2.50 } };
const ceilingUsd = 6 * (4096 * 0.30 + 1024 * 2.50) / 1_000_000;
assert.ok(ceilingUsd < 1);
const budgetPath = resolve(output, "request-budget.json");
let generated = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, "utf8")).generated : 0;
const maximumRequests = 6;
assert.ok(Number.isInteger(generated) && generated >= 0 && generated < maximumRequests, "The pilot budget is exhausted");
const originalFetch = globalThis.fetch;
const rows = [];
try {
  const providerModule = await server.ssrLoadModule("/src/server/ai/ai-provider.ts");
  const { generateAiJson } = await server.ssrLoadModule("/src/server/ai/ai-generation.ts");
  const { buildSearchQueryRequest } = await server.ssrLoadModule("/src/server/organization/search-query-request.ts");
  const { compileSearchQuerySuggestion } = await server.ssrLoadModule("/src/shared/search-query.ts");
  const provider = providerModule.getAiProvider();
  assert.ok(provider, "A configured provider is required; keys are never printed");
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url);
    assert.ok(["api.openai.com", "generativelanguage.googleapis.com"].includes(endpoint.hostname));
    assert.equal(options.method, "POST");
    const body = JSON.parse(options.body);
    if (endpoint.pathname.endsWith("/responses") || endpoint.pathname.endsWith(":generateContent")) {
      assert.ok(++generated <= maximumRequests, "The cumulative request cap must hold; no automatic retries");
      writeFileSync(budgetPath, JSON.stringify({ generated, maximum: maximumRequests, budgetUsd: 1, updatedAt: new Date().toISOString() }));
      assert.ok((body.max_output_tokens ?? body.generationConfig.maxOutputTokens) <= 1024);
      const data = JSON.parse(body.input ?? body.contents[0].parts[0].text);
      assert.deepEqual(Object.keys(data), ["question"]);
      assert.ok(questions.includes(data.question));
    }
    return originalFetch(url, options);
  };
  for (const question of questions) {
    const started = performance.now();
    try {
      const request = { ...buildSearchQueryRequest(question), outputTokens: 1024 };
      const result = await generateAiJson(request, AbortSignal.timeout(25_000), { inputTokens: 4096 }, provider);
      const unit = price[result.model] ?? price[provider === "openai" ? "gpt-6-luna" : "gemini-3.5-flash-lite"];
      const estimatedUsd = (result.usage.inputTokens * unit.input + result.usage.outputTokens * unit.output) / 1_000_000;
      let suggestion = null;
      let valid = true;
      try { suggestion = compileSearchQuerySuggestion(result.value, question); } catch { valid = false; }
      rows.push({ question, model: result.model, usage: result.usage, estimatedUsd, valid, suggestion, response: result.value, elapsedMs: performance.now() - started });
    } catch (error) {
      rows.push({ question, ok: false, code: typeof error?.code === "string" ? error.code : "unavailable", elapsedMs: performance.now() - started });
      break;
    }
  }
  const result = { provider, budgetUsd: 1, maximumGenerationRequests: maximumRequests, perRoundMaximum: 3, inputTokenCap: 4096, outputTokenCap: 1024, standardTokenCeilingUsd: ceilingUsd,
    priceSources: ["https://developers.openai.com/api/docs/models/gpt-6-luna", "https://ai.google.dev/gemini-api/docs/pricing/"], generated, rows,
    estimatedUsd: rows.reduce((sum, row) => sum + (row.estimatedUsd ?? 0), 0),
    scope: "User authorized <=USD1 synthetic question-only calls. Actual existing provider adapter/prompt/schema; app auth/quota/ledger verified separately with synthetic tests. No personal files, filenames, paths, index, conversation history or tools. No production DB migration or feature flag change. No provider/model substitution or automatic retries." };
  writeFileSync(resolve(output, generated <= 3 ? "result.json" : "result-v2.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ provider, generated, rows: rows.map(({ valid, usage, estimatedUsd, code }) => ({ valid, usage, estimatedUsd, code })), estimatedUsd: result.estimatedUsd, standardTokenCeilingUsd: ceilingUsd }));
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
