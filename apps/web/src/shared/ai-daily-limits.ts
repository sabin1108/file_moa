export const AI_DAILY_LIMITS = { demo: 30, live: 100, global: 300 } as const;

export function aiUsageDay(now: number) {
  const date = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const startsAt = Date.parse(`${date}T00:00:00+09:00`);
  return { date, startsAt, resetsAt: startsAt + 86400000 };
}
