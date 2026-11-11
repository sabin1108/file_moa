import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SAMPLE_LIFETIME_MS, type SampleSession } from "../shared/sample-contract";

export const SAMPLE_COOKIE = "moa.sample-session";
export const SAMPLE_SESSION_SECONDS = SAMPLE_LIFETIME_MS / 1000;

const sessionSchema = z.strictObject({
  kind: z.literal("sample"),
  id: z.uuid(),
  expiresAt: z.number().int().positive(),
  version: z.literal("1"),
});

function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!secret || secret.length < 32) throw new Error("sample-session-unavailable");

  return createHmac("sha256", secret).update(`moa-sample-v1:${payload}`).digest("base64url");
}

export function createSampleSession(now = Date.now()): {
  token: string;
  session: SampleSession
} {
  const session: SampleSession = { kind: "sample", id: randomUUID(), expiresAt: now + SAMPLE_SESSION_SECONDS * 1000, version: "1" };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");

  return { session, token: `${payload}.${signature(payload)}` };
}

export function readSampleSession(token: string | undefined, now = Date.now()): SampleSession | null {
  if (!token || token.length > 1024) return null;

  try {
    const parts = token.split(".");

    if (parts.length !== 2) return null;

    const [payload, supplied] = parts;
    const expected = signature(payload);

    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;

    const session = sessionSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));

    if (session.expiresAt <= now || session.expiresAt > now + SAMPLE_LIFETIME_MS + 60_000) return null;

    return session;
  } catch {
    return null;
  }
}

export function readSampleAccess(token: string | undefined, now = Date.now()) {
  const session = readSampleSession(token, now);

  return session ? { session, remainingMs: Math.min(SAMPLE_LIFETIME_MS, session.expiresAt - now) } : null;
}
