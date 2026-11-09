import "server-only";
import { createHmac, randomUUID } from "node:crypto";
import type { AiProvider } from "../shared/ai-provider";
import type { SampleAiUsage } from "../shared/sample-ai";
import type { UsageSummary } from "../shared/ai-usage";
import { getDatabase } from "./database/client";
import { readChatSession } from "./chat-session";

type UsageOwner = { workspaceId: string; sessionUserId: string };
const enabled = () => process.env.AI_USAGE_LEDGER_ENABLED === "true";

export async function startUsage(owner: UsageOwner, requestId: string, provider: AiProvider, operation: "chat" | "grounded" | "organize") {
  if (!enabled()) return;
  await getDatabase().$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('moa.user_id', ${owner.sessionUserId}, true)`;
    await tx.aiUsageEvent.create({ data: { id: randomUUID(), workspaceId: owner.workspaceId, requestId, provider, operation, status: "reserved" } });
  });
}

export async function finishUsage(owner: UsageOwner, requestId: string, model: string | null, usage: SampleAiUsage | null) {
  if (!enabled()) return;
  await getDatabase().$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('moa.user_id', ${owner.sessionUserId}, true)`;
    // Only the first terminal settlement can change a reservation.
    await tx.aiUsageEvent.updateMany({ where: { workspaceId: owner.workspaceId, requestId, status: "reserved" }, data: {
      status: usage ? "completed" : "unknown", model, completedAt: new Date(),
      inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, totalTokens: usage?.totalTokens ?? null,
    } });
  });
}

export async function readUsage(requestHeaders: Headers): Promise<UsageSummary | null> {
  const session = await readChatSession(requestHeaders);
  if (!session) return null;
  const rules = [
    { key: `live-ai-v1:user:${session.sessionUserId}`, maximum: 10, window: 3600000 },
    { key: `live-ai-v1:workspace:${session.workspaceId}`, maximum: 10, window: 3600000 },
    { key: "sample-ai-v1:global-minute", maximum: 1, window: 60000 },
    { key: "sample-ai-v1:global-hour", maximum: 12, window: 3600000 },
  ];
  const hash = (key: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update("moa-rate-limit-v1\0").update(key).digest("hex");
  const counters = await getDatabase().rateLimit.findMany({ where: { key: { in: rules.map(rule => hash(rule.key)) } }, select: { key: true, count: true, lastRequest: true } });
  let used = 0;
  let retryAfter = 0;
  for (const [index, rule] of rules.entries()) {
    const counter = counters.find(item => item.key === hash(rule.key));
    const remaining = counter ? Number(counter.lastRequest) + rule.window - Date.now() : 0;
    if (remaining <= 0) continue;
    if (index < 2) used = Math.max(used, counter!.count);
    if (counter!.count >= rule.maximum) retryAfter = Math.max(retryAfter, Math.ceil(remaining / 1000));
  }
  const base: UsageSummary = { ledger: enabled() ? "enabled" : "not-enabled", entries: [], used, limit: 10, retryAfter };
  if (!enabled()) return base;
  try {
    return await getDatabase().$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('moa.user_id', ${session.sessionUserId}, true)`;
      await tx.aiUsageEvent.updateMany({
        where: { workspaceId: session.workspaceId, status: "reserved", createdAt: { lt: new Date(Date.now() - 600000) } },
        data: { status: "unknown", completedAt: new Date() },
      });
      const entries = await tx.aiUsageEvent.findMany({ where: { workspaceId: session.workspaceId }, orderBy: { createdAt: "desc" }, take: 50, select: { requestId: true, provider: true, operation: true, status: true, model: true, createdAt: true, inputTokens: true, outputTokens: true, totalTokens: true } });
      return { ...base, entries: entries.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() })) };
    });
  } catch { return { ...base, ledger: "unavailable" }; }
}
