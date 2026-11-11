"use server";

import "server-only";
import { cookies, headers } from "next/headers";
import { SAMPLE_COOKIE } from "../../server/sample-session";
import { classifySample } from "../../server/sample-ai";
import { organizeSample } from "../../server/sample-organization";
import type { AiProvider } from "../../shared/ai-provider";

export async function sampleClassificationAction(provider: AiProvider | null, input: unknown) {
  return classifySample(
    input,
    { token: (await cookies()).get(SAMPLE_COOKIE)?.value, origin: (await headers()).get("origin") },
    provider ?? null
  );
}

export async function sampleOrganizationAction(provider: AiProvider | null, input: unknown) {
  return organizeSample(
    input,
    { token: (await cookies()).get(SAMPLE_COOKIE)?.value, origin: (await headers()).get("origin") },
    provider ?? null
  );
}
