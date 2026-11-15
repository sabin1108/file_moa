"use server";

import "server-only";
import { headers } from "next/headers";
import { organizeLive } from "../../server/organization/live-organization";
import type { AiProvider } from "../../shared/ai-provider";
import { answerGrounded } from "../../server/organization/grounded-chat";
import { interpretSearchQuery } from "../../server/organization/search-query";

export async function liveOrganizationAction(provider: AiProvider | null, input: unknown) {
  return organizeLive(input, (await headers()).get("origin"), provider ?? null);
}

export async function groundedChatAction(provider: AiProvider | null, input: unknown) {
  return answerGrounded(input, await headers(), provider);
}

export async function searchQueryAction(provider: AiProvider | null, input: unknown) {
  return interpretSearchQuery(input, await headers(), provider);
}
