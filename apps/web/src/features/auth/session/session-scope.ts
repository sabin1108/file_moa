import { z } from "zod";

const response = z.object({
  user: z.object({ id: z.string().min(1).max(128), emailVerified: z.boolean() }),
  session: z.object({ userId: z.string(), expiresAt: z.string() }),
});

export function sessionScope(value: unknown, expectedUser: string, now = Date.now()): number | null {
  const parsed = response.safeParse(value);

  if (!parsed.success || parsed.data.user.id !== expectedUser || parsed.data.session.userId !== expectedUser) return null;

  const expiresAt = Date.parse(parsed.data.session.expiresAt);

  return Number.isFinite(expiresAt) && expiresAt > now ? expiresAt : null;
}
