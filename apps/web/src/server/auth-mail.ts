import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";

export function authenticationMailConfig() {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const address = from?.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] ?? from;

  if (!key || !from || /[\r\n]/.test(from) || !z.email().safeParse(address).success) {
    throw new Error("Authentication email is not configured.");
  }

  return { key, from };
}

export async function sendAuthenticationEmail(message: { to: string; subject: string; text: string }) {
  const { key, from } = authenticationMailConfig();

  if (!z.email().safeParse(message.to).success) {
    throw new Error("Invalid authentication email recipient.");
  }

  const body = JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text });
  const fingerprint = createHmac("sha256", key).update(body).digest("hex");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `moa-auth-${fingerprint}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) throw new Error("Email provider rejected the request.");

    return z.object({ id: z.string().min(1) }).parse(await response.json());
  } catch {
    console.error("Authentication email delivery failed.");
    throw new Error("Authentication email delivery failed.");
  }
}
