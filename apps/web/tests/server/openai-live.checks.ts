import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generateOrganization } from "../../src/server/organization-generation";
import { parseLiveOrganizationResponse } from "../../src/shared/live-organization-review";
import type { OrganizationRequest } from "../../src/shared/organization";

if (process.env.MOA_RUN_OPENAI_LIVE !== "1") throw Error("Explicit synthetic OpenAI evaluation opt-in required.");
process.loadEnvFile(resolve("apps/web/.env.local"));
process.env.AI_PROVIDER = "openai";
if (!process.env.OPENAI_API_KEY?.trim()) throw Error("OpenAI key is not configured.");

const output = resolve("docs/verification/completion-five/openai");
const calls: { method: string; status: number; latencyMs: number }[] = [];
const request: OrganizationRequest = {
  instruction: "웹사이트 성능 실측 자료를 성능 폴더에 모으는 제안을 해 주세요. 날짜별 분류는 하지 마세요.",
  context: { liveReview: true, reference: null, destination: null, answers: [] },
  documents: [{ id: "synthetic-performance", name: "synthetic-performance.md", sourcePath: [], excerpt: "# 웹사이트 성능 실측\n2026년 10월 14일 첫 화면을 측정했습니다.\nLCP는 2.8초, INP는 180ms였습니다. 다음 점검에서는 이미지 용량을 줄입니다." }],
};
const realFetch = globalThis.fetch;
vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
  const url = String(args[0]);
  if (!["https://api.openai.com/v1/responses/input_tokens", "https://api.openai.com/v1/responses"].includes(url) || calls.length >= 2) throw Error("Unexpected evaluation request.");
  const method = url.endsWith("input_tokens") ? "input_tokens" : "responses";
  if (calls.some(call => call.method === method)) throw Error("Automatic retries are forbidden.");
  const call = { method, status: 0, latencyMs: 0 }; calls.push(call);
  const started = performance.now();
  try {
    const response = await realFetch(...args);
    call.status = response.status;
    return response;
  } finally { call.latencyMs = Math.round(performance.now() - started); }
});

it("checks one actual synthetic organization generation without retry", async () => {
  const started = performance.now();
  let record: Record<string, unknown> = {};
  try {
    const result = await generateOrganization(request, AbortSignal.timeout(25_000), "openai");
    const reviewed = parseLiveOrganizationResponse(result.value, request, []);
    record = { model: result.model, usage: result.usage, matches: reviewed.organization.matches.length, held: reviewed.organization.held.length,
      estimatedStandardGenerationUsd: Number((result.usage.inputTokens * 0.1 / 1_000_000 + result.usage.outputTokens * 0.5 / 1_000_000).toFixed(8)),
      pricingNote: "Estimated Standard generation only. Input counting, actual service tier, credits and invoicing must be checked in the billing dashboard." };
    expect(reviewed.organization.matches.map(match => match.documentId)).toEqual(["synthetic-performance"]);
    expect(reviewed.organization.matches[0].date).toBeNull();
    expect(reviewed.organization.held).toEqual([]);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(result.usage.inputTokens).toBeLessThanOrEqual(8192);
    expect(result.usage.outputTokens).toBeLessThanOrEqual(3200);
    record.passed = true;
  } catch {
    record.passed = false;
    throw Error("Synthetic OpenAI evaluation failed; inspect the sanitized request status report. No automatic retry.");
  } finally {
    vi.unstubAllGlobals();
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "actual-check.json"), JSON.stringify({ at: new Date().toISOString(), condition: "One synthetic document through actual production organization policy, OpenAI adapter and live response parser. No authentication, DB quota, personal folder or source writes.", totalLatencyMs: Math.round(performance.now() - started), calls, ...record }, null, 2) + "\n");
  }
});
