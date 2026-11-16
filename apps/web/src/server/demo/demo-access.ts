import "server-only";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const DEMO_VISITOR_COOKIE = "moa.demo-visitor";
export const DEMO_VISITOR_SECONDS = 30 * 86400;
const visitorSchema = z.strictObject({ id: z.uuid(), expiresAt: z.number().int().positive(), invite: z.string().regex(/^[a-f0-9]{64}$/) });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function inviteDigest() {
  const token = process.env.DEMO_ACCESS_TOKEN;
  if (!token || !/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw Error("demo-access-unavailable");
  return digest(token);
}
function signature(payload: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw Error("demo-access-unavailable");
  return createHmac("sha256", secret).update(`moa-demo-visitor-v1:${payload}`).digest("base64url");
}
export function validDemoInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) return false;
  try { return timingSafeEqual(Buffer.from(digest(token), "hex"), Buffer.from(inviteDigest(), "hex")); }
  catch { return false; }
}
export function createDemoVisitor(now = Date.now()) {
  const visitor = { id: randomUUID(), expiresAt: now + DEMO_VISITOR_SECONDS * 1000, invite: inviteDigest() };
  const payload = Buffer.from(JSON.stringify(visitor)).toString("base64url");
  return { visitor, token: `${payload}.${signature(payload)}` };
}
export function readDemoVisitor(token: string | undefined, now = Date.now()) {
  if (!token || token.length > 1024) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expected = signature(parts[0]);
    if (parts[1].length !== expected.length || !timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) return null;
    const visitor = visitorSchema.parse(JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")));
    if (visitor.invite !== inviteDigest() || visitor.expiresAt <= now || visitor.expiresAt > now + DEMO_VISITOR_SECONDS * 1000 + 60000) return null;
    return visitor;
  } catch { return null; }
}

export function demoAccessDenied() {
  return new Response("유효한 체험 링크로 접속해 주세요.", { status: 404, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "content-type": "text/plain; charset=utf-8" } });
}
