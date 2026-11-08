"use server";
import "server-only";
import { headers } from "next/headers";
import { organizeLive } from "../../server/live-organization";
import type { AiProvider } from "../../shared/ai-provider";

export async function liveOrganizationAction(provider: AiProvider | null, input: unknown) {
  return organizeLive(input, (await headers()).get("origin"), provider ?? null);
}
