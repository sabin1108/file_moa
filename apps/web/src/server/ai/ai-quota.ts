import "server-only";
import { AI_DAILY_LIMITS, aiUsageDay } from "../../shared/ai-daily-limits";

export function dailyAiRules(kind: "demo" | "live", identity: string, now: number) {
  const day = aiUsageDay(now);
  return [
    { key: `${kind}-ai-v2:day:${day.date}:${identity}`, max: AI_DAILY_LIMITS[kind], window: 86400, retryAt: day.resetsAt },
    { key: `${kind}-ai-v2:global-day:${day.date}`, max: AI_DAILY_LIMITS.global, window: 86400, retryAt: day.resetsAt },
  ];
}

export function liveAiRules(owner: { workspaceId: string; sessionUserId: string }, requestId: string, now: number) {
  return [
    { key: `live-ai-v1:request:${owner.workspaceId}:${requestId}`, max: 1, window: 3600 },
    ...dailyAiRules("live", owner.sessionUserId, now),
  ];
}
