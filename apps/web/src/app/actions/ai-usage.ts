"use server";

import "server-only";
import { headers } from "next/headers";
import { readUsage } from "../../server/ai/ai-usage";

export async function readUsageAction() {
  return readUsage(await headers());
}
