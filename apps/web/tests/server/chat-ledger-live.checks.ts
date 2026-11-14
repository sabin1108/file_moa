import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

vi.mock("server-only", () => ({}));
vi.mock("../../src/server/database/client", () => ({ getDatabase: vi.fn() }));

import { getDatabase } from "../../src/server/database/client";
import { handleChat } from "../../src/server/chat/chat";
import { chatEventSchema } from "../../src/shared/general-chat";

if (process.env.MOA_RUN_CHAT_LEDGER_LIVE !== "1") throw Error("Explicit chat ledger live opt-in required.");

const output = resolve("docs/verification/recording-latency/performance");
const fixture = process.env.MOA_CHAT_PROVIDER_FIXTURE === "1";
const secret = `fixture-chat-ledger-${randomUUID()}`;
const userId = `fixture-chat-${randomUUID()}`;
const sessionToken = randomUUID();
let database: PrismaClient;
const nativeFetch = globalThis.fetch;
const calls: {
  path: string;
  status: number | null;
  latencyMs: number | null
}[] = [];

function writeReport(record: Record<string, unknown>) {
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, fixture ? "chat-ledger-fixture.json" : "chat-ledger-live.json"), JSON.stringify({
    at: new Date().toISOString(),
    provider: "openai",
    attemptedHttpCalls: calls,
    condition: `${fixture ? "Synthetic provider stream, no external HTTP or model" : "One synthetic question to the real provider"}; production handler, isolated disposable PostgreSQL, signed fixture session and enabled ledger. No real account, personal content, production database or retry.`,
    ...record,
  }, null, 2) + "\n");
}

function sessionHeaders() {
  const signature = createHmac("sha256", secret).update(sessionToken).digest("base64");

  return new Headers({
    cookie: `better-auth.session_token=${encodeURIComponent(`${sessionToken}.${signature}`)}`,
    origin: "http://127.0.0.1:3034",
    "content-type": "application/json",
  });
}

beforeAll(async () => {
  const url = new URL(process.env.MOA_TEST_DATABASE_URL ?? "");

  expect(url.hostname).toBe("127.0.0.1");
  expect(url.username).toBe("moa_runtime");
  expect(url.pathname).toBe("/moa_auth_test");
  expect(process.env.MOA_TEST_DATABASE_RUN).toMatch(/^[a-f0-9-]{36}$/u);
  expect(process.env.OPENAI_API_KEY?.trim()).toBeTruthy();
  expect(process.env.AI_PROVIDER).toBe("openai");
  database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ssl: false, max: 1 }),
    log: [],
    errorFormat: "minimal"
  });
  vi.mocked(getDatabase).mockReturnValue(database);
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.BETTER_AUTH_URL = "http://127.0.0.1:3034";
  process.env.RESEND_API_KEY = "fixture-mail-disabled";
  process.env.EMAIL_FROM = "Fixture <fixture@example.invalid>";
  process.env.AI_USAGE_LEDGER_ENABLED = "true";
  vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    const path = url.replace("https://api.openai.com/v1/", "");

    if (!url.startsWith("https://api.openai.com/v1/") || !["responses/input_tokens", "responses"].includes(path)
      || calls.some(call => call.path === path)
      || calls.length >= 2) throw new Error("Unexpected or retried live provider request.");

    const call = { path, status: null as number | null, latencyMs: null as number | null };

    calls.push(call);
    writeReport({ phase: "requesting", limits: { maximumProviderRequests: 2, maximumPerEndpoint: 1 } });

    const started = performance.now();

    try {
      const response = fixture ? fixtureResponse(path) : await nativeFetch(...args);

      call.status = response.status;

      return response;
    } finally {
      call.latencyMs = Math.round(performance.now() - started);
    }
  });
  await database.user.create({
    data: { id: userId, name: "Synthetic chat", email: `${userId}@example.invalid`, emailVerified: true }
  });
  await database.session.create({
    data: {
      id: `session-${userId}`,
      userId,
      token: sessionToken,
      expiresAt: new Date(Date.now() + 3_600_000)
    }
  });
  writeReport({ phase: "ready", limits: { maximumProviderRequests: 2, maximumPerEndpoint: 1 } });
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await database?.$disconnect();
});

it("records one synthetic streaming chat and its completed ledger row", async () => {
  const requestId = `${Date.now()}:${randomUUID()}`;
  const request = new Request("http://127.0.0.1:3034/api/chat", {
    method: "POST",
    headers: sessionHeaders(),
    body: JSON.stringify({
      requestId,
      provider: "openai",
      owner: { userId, workspaceId: "pending" },
      messages: [{ role: "user", content: "한 문장으로 물의 화학식을 알려줘." }],
    }),
  });
  const owner = await database.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;

    return tx.workspace.create({ data: { ownerUserId: userId } });
  });
  const body = JSON.parse(await request.text()) as Record<string, unknown>;

  body.owner = { userId, workspaceId: owner.id };

  const timedRequest = new Request(
    "http://127.0.0.1:3034/api/chat",
    { method: "POST", headers: sessionHeaders(), body: JSON.stringify(body) }
  );
  const work: Promise<void>[] = [];
  const started = performance.now();
  let failure: unknown;
  let response: Response | undefined;
  const received: {
    type: string;
    atMs: number;
    text?: string;
    model?: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number
    } | null
  }[] = [];

  try {
    response = await handleChat(timedRequest, task => {
      work.push(task);
    });
    expect(response.status).toBe(200);

    const reader = response.body?.getReader();

    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader!.read();

      buffer += decoder.decode(value, { stream: !done });

      let end: number;

      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);

        buffer = buffer.slice(end + 2);

        if (!frame.startsWith("data: ")) continue;

        const event = chatEventSchema.parse(JSON.parse(frame.slice(6)));

        received.push({
          type: event.type,
          atMs: Math.round(performance.now() - started),
          ...(event.type === "text_delta" ? { text: event.text } : {}),
          ...(event.type === "completed" ? { model: event.model, usage: event.usage } : {})
        });
      }

      if (done) break;
    }

    reader!.releaseLock();
    await Promise.all(work);

    const completed = received.find(event => event.type === "completed");

    expect(received[0]?.type).toBe("accepted");
    expect(received.some(event => event.type === "text_delta")).toBe(true);
    expect(completed?.usage?.totalTokens).toBeGreaterThan(0);

    const row = await database.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${userId}, true)`;

      return tx.aiUsageEvent.findFirstOrThrow({
        where: { workspaceId: owner.id, requestId },
        select: { status: true, model: true, inputTokens: true, outputTokens: true, totalTokens: true }
      });
    });

    expect(row).toMatchObject({
      status: "completed",
      model: completed!.model,
      inputTokens: completed!.usage!.inputTokens,
      outputTokens: completed!.usage!.outputTokens,
      totalTokens: completed!.usage!.totalTokens
    });

    const deltas = received.filter(event => event.type === "text_delta");
    const gaps = deltas.slice(1).map((event, index) => event.atMs - deltas[index].atMs);

    writeReport({
      phase: "completed",
      acceptedMs: received.find(event => event.type === "accepted")?.atMs ?? null,
      firstTextMs: deltas[0]?.atMs ?? null,
      completedMs: completed?.atMs ?? null,
      deltaCount: deltas.length,
      maxPublishedGapMs: gaps.length ? Math.max(...gaps) : 0,
      model: row.model,
      usage: { inputTokens: row.inputTokens, outputTokens: row.outputTokens, totalTokens: row.totalTokens }
    });
  } catch (error) {
    failure = error;

    throw error;
  } finally {
    if (failure) writeReport({
      phase: "failed",
      responseStatus: response?.status ?? null,
      receivedEventTypes: received.map(event => event.type),
      failure: errorName(failure)
    });
  }
}, 45_000);

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function fixtureResponse(path: string) {
  if (path === "responses/input_tokens") return Response.json({ input_tokens: 10 });

  const text = "물의 화학식은 H2O입니다.";
  const events = [
    { type: "response.output_text.delta", delta: text },
    {
      type: "response.completed",
      response: {
        status: "completed",
        model: "fixture-model",
        usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
        output: [{ type: "message", status: "completed", content: [{ type: "output_text", text }] }]
      }
    },
  ];

  return new Response(
    events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } }
  );
}
