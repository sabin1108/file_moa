import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const capture = vi.hoisted(() => ({
  value: null as unknown,
  promptHash: "",
  requests: [] as {
    method: string;
    status: number;
    latencyMs: number;
    countedTokens?: number;
    modelVersion?: string
  }[]
}));

vi.mock("../../src/server/gemini-generation", async original => {
  const actual = await original<typeof import("../../src/server/gemini-generation")>();

  return {
    ...actual,
    generateGeminiJson: async (...args: Parameters<typeof actual.generateGeminiJson>) => {
      const result = await actual.generateGeminiJson(...args);

      capture.value = result.value;

      return result;
    }
  };
});

import { organizeSample } from "../../src/server/sample-organization";
import { getSampleCatalog } from "../../src/server/sample-catalog";
import { createSampleSession } from "../../src/server/sample-session";
import { getDatabase } from "../../src/server/database/client";
import { SAMPLE_GEMINI_MODEL } from "../../src/server/gemini-generation";
import { selectOrganizationCandidates } from "../../src/features/sample-workspace/lib/organization-candidates";
import { corpusDigest, evaluateOrganizationResponse, scopedEvaluationDocuments } from "../sample-workspace/organization-evaluation";
import fixture from "../../../../tests/fixtures/classification/request-evaluation.json";

if (process.env.MOA_RUN_ORGANIZATION_LIVE !== "1") {
  throw new Error("Explicit synthetic model evaluation opt-in required.");
}

const scenario = fixture.cases.find(item => item.id === process.env.MOA_ORGANIZATION_CASE && item.split === "development");

if (!scenario) {
  throw new Error("Select one development request with MOA_ORGANIZATION_CASE.");
}

const output = resolve("docs/verification/organization-evaluation");
const policyHash = createHash("sha256").update(readFileSync(resolve("apps/web/src/server/sample-organization.ts"))).digest("hex");

process.loadEnvFile(resolve("apps/web/.env.local"));
process.env.AI_PROVIDER = "gemini";
process.chdir(resolve("apps/web"));

const catalog = getSampleCatalog();
const documents = catalog.documents.map(({ id, name, excerpt, sourceFolderId }) => ({
  id,
  name,
  excerpt,
  sourcePath: (catalog.folders.find(folder => folder.id === sourceFolderId)?.label ?? "받은 자료").split("/")
}));
const scoped = scopedEvaluationDocuments(scenario, documents);
const candidates = selectOrganizationCandidates(scoped, scenario.instruction);
const realFetch = globalThis.fetch;

vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
  const method = String(args[0]).split(":").at(-1)!;

  expect(["countTokens", "generateContent"]).toContain(method);
  expect(String(args[0])).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${SAMPLE_GEMINI_MODEL}:${method}`);

  const body = String(args[1]?.body);

  expect(body.includes(process.env.GEMINI_API_KEY!)).toBe(false);
  expect(body).not.toMatch(/expectedContentDate|matchedIds|excludedIds|heldIds|allowedFolderIds|holdout-only/);

  const payload = JSON.parse(body);
  const generation = method === "countTokens" ? payload.generateContentRequest : payload;
  const request = JSON.parse(generation.contents[0].parts[0].text);

  expect(request).toEqual({ instruction: scenario.instruction, documents: candidates });

  if (method === "generateContent") {
    capture.promptHash = createHash("sha256").update(body).digest("hex");
  }

  const started = Date.now();
  const response = await realFetch(...args);
  const metadata = await response.clone().json().catch(() => null) as {
    totalTokens?: number;
    modelVersion?: string
  } | null;

  capture.requests.push({
    method,
    status: response.status,
    latencyMs: Date.now() - started,
    countedTokens: metadata?.totalTokens,
    modelVersion: metadata?.modelVersion
  });

  return response;
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await getDatabase().$disconnect();
});
it(`evaluates one actual synthetic request: ${scenario.id}`, async () => {
  expect(corpusDigest(documents)).toBe(fixture.corpus.development.sha256);
  expect(process.env.GEMINI_API_KEY?.trim()).toBeTruthy();
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.length).toBeLessThanOrEqual(40);

  const requiredIds = [...scenario.expected.matches.map(item => item.documentId), ...scenario.expected.heldIds];

  expect(requiredIds.filter(id => !candidates.some(document => document.id === id))).toEqual([]);

  const started = Date.now();
  const result = await organizeSample({
    requestId: crypto.randomUUID(),
    documentIds: candidates.map(document => document.id),
    instruction: scenario.instruction,
    consent: true
  },
    { token: createSampleSession().token, origin: new URL(process.env.BETTER_AUTH_URL!).origin });
  const evaluation = evaluateOrganizationResponse(result.ok ? result.organization : capture.value, scenario, candidates);
  const at = new Date().toISOString();

  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, `live-${scenario.id}-${at.replace(/[:.]/g, "-")}.json`), JSON.stringify({
    at,
    datasetVersion: fixture.version,
    caseId: scenario.id,
    intentId: scenario.intentId,
    split: scenario.split,
    reviewStatus: fixture.reviewStatus,
    corpusHash: fixture.corpus.development.sha256,
    policyHash,
    promptHash: capture.promptHash,
    model: SAMPLE_GEMINI_MODEL,
    scopeCount: scoped.length,
    candidateIds: candidates.map(document => document.id),
    latencyMs: Date.now() - started,
    requests: capture.requests,
    result,
    rawSyntheticResponse: capture.value,
    evaluation,
  }, null, 2) + "\n");
  expect(capture.requests.filter(request => request.method === "generateContent").length).toBeLessThanOrEqual(1);
  expect(result.ok, result.ok ? "production parser accepted the plan" : result.code).toBe(true);
  expect(evaluation.violations).toEqual([]);
});
