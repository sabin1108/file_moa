import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { SAMPLE_COOKIE } from "./sample-session";
import { DEMO_VISITOR_COOKIE } from "./demo-access";
import { requireSampleContext, sampleAiFailure } from "./sample-ai";
import { answerSample } from "./sample-answer";
import { organizeSample } from "./sample-organization";
import { jsonTextPreview } from "../../shared/json-text-preview";
import { readProviderJson } from "../ai/ai-provider";

const inputSchema = z.strictObject({ kind: z.enum(["answer", "organization"]), provider: z.enum(["openai", "gemini"]).nullable(), input: z.unknown() });

export async function handleSampleStream(request: Request) {
  const jar = await cookies();
  const context = { token: jar.get(SAMPLE_COOKIE)?.value, visitorToken: jar.get(DEMO_VISITOR_COOKIE)?.value, origin: request.headers.get("origin") };
  try { requireSampleContext(context); }
  catch { return Response.json({ error: "session-or-origin" }, { status: 403, headers: { "cache-control": "no-store" } }); }
  let body;
  let requestId: string;
  try {
    body = inputSchema.parse(await readProviderJson(new Response(request.body), 263_000));
    requestId = z.object({ requestId: z.uuid() }).parse(body.input).requestId;
  } catch { return Response.json({ error: "input" }, { status: 400, headers: { "cache-control": "no-store" } }); }
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sequence = 0;
      let previous = "";
      const send = (event: object) => {
        signal.throwIfAborted();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, requestId, sequence: sequence++ })}\n\n`));
      };
      try {
        send({ type: "accepted" });
        const preview = (json: string) => {
          requireSampleContext(context);
          const text = jsonTextPreview(json, body.kind === "answer" ? "answer" : "summary");
          if (text && text !== previous) {
            if (!text.startsWith(previous)) throw new Error("sample-preview-mismatch");
            send({ type: "text", text: text.slice(previous.length) });
            previous = text;
          }
        };
        const result = body.kind === "answer"
          ? await answerSample(body.input, context, body.provider, preview, signal)
          : await organizeSample(body.input, context, body.provider, preview, signal);
        send({ type: "result", result });
      } catch (error) {
        if (!signal.aborted) send({ type: "result", result: sampleAiFailure(error) });
      } finally { if (!signal.aborted) controller.close(); }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
