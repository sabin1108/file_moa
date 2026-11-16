"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { SAMPLE_COOKIE } from "../../server/demo/sample-session";
import { DEMO_VISITOR_COOKIE } from "../../server/demo/demo-access";
import { classifySample } from "../../server/demo/sample-ai";
import { organizeSample } from "../../server/demo/sample-organization";
import { answerSample } from "../../server/demo/sample-answer";
import type { AiProvider } from "../../shared/ai-provider";

export async function sampleAnswerAction(provider: AiProvider | null, input: unknown) {
  return answerSample(input, {
    token: (await cookies()).get(SAMPLE_COOKIE)?.value,
    visitorToken: (await cookies()).get(DEMO_VISITOR_COOKIE)?.value,
    origin: (await headers()).get("origin"),
  }, provider);
}

export async function sampleClassificationAction(provider: AiProvider | null, input: unknown) {
  return classifySample(
    input,
    { token: (await cookies()).get(SAMPLE_COOKIE)?.value, visitorToken: (await cookies()).get(DEMO_VISITOR_COOKIE)?.value, origin: (await headers()).get("origin") },
    provider ?? null
  );
}

export async function sampleOrganizationAction(provider: AiProvider | null, input: unknown) {
  return organizeSample(
    input,
    { token: (await cookies()).get(SAMPLE_COOKIE)?.value, visitorToken: (await cookies()).get(DEMO_VISITOR_COOKIE)?.value, origin: (await headers()).get("origin") },
    provider ?? null
  );
}
